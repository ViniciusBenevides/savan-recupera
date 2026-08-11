"use client";
import { useEffect, useState } from "react";
import { Card, Button, Input, Label, Textarea, Select, Badge } from "@/components/ui/primitives";
import { FileText, Plus, Trash2, RefreshCw, AlertTriangle, Info } from "lucide-react";

type T = { name: string; status: string; category: string; language: string; waba_id?: string; components?: any; quality_score?: string | null; rejected_reason?: string | null; erro?: string };

const TONE: Record<string, any> = { APPROVED: "green", PENDING: "amber", IN_APPEAL: "amber", PENDING_DELETION: "amber", REJECTED: "rose", DISABLED: "rose", PAUSED: "rose" };

function corpoDoTemplate(components: any): string {
  const body = Array.isArray(components) ? components.find((c) => c.type === "BODY") : null;
  return body?.text ?? "";
}

export function TemplatesManager({ conta }: { conta?: string | null }) {
  const [lista, setLista] = useState<T[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [semWaba, setSemWaba] = useState(false);
  const [erro, setErro] = useState("");
  const [criando, setCriando] = useState(false);

  // formulário do novo template
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("UTILITY");
  const [idioma, setIdioma] = useState("pt_BR");
  const [corpo, setCorpo] = useState("");
  const [exemplo, setExemplo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const q = conta ? `?conta=${conta}` : "";

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/meta/templates${q}`);
      const d = await r.json();
      if (!r.ok) { setErro(d.erro ?? "Falha ao carregar."); setCarregando(false); return; }
      setSemWaba((d.wabas ?? []).length === 0);
      setLista(d.templates ?? []);
    } catch { setErro("Falha ao carregar."); }
    setCarregando(false);
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [conta]);

  const numVars = (corpo.match(/\{\{\d+\}\}/g) ?? []).length;

  async function criar() {
    setErro("");
    if (!nome.trim() || !corpo.trim()) { setErro("Informe nome e corpo."); return; }
    const components: any[] = [{ type: "BODY", text: corpo.trim() }];
    if (numVars > 0) {
      const vals = exemplo.split("|").map((s) => s.trim()).filter(Boolean);
      if (vals.length < numVars) { setErro(`O corpo tem ${numVars} variável(is) {{n}} — dê ${numVars} exemplos separados por "|".`); return; }
      components[0].example = { body_text: [vals.slice(0, numVars)] };
    }
    setSalvando(true);
    try {
      const r = await fetch(`/api/meta/templates`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conta, name: nome, category: categoria, language: idioma, components }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d.erro ?? "Falha ao criar."); setSalvando(false); return; }
      setNome(""); setCorpo(""); setExemplo(""); setCriando(false);
      await carregar();
    } catch { setErro("Falha ao criar."); }
    setSalvando(false);
  }

  async function excluir(t: T) {
    if (!confirm(`Excluir o template "${t.name}"?`)) return;
    const r = await fetch(`/api/meta/templates?name=${encodeURIComponent(t.name)}&waba_id=${t.waba_id ?? ""}${conta ? `&conta=${conta}` : ""}`, { method: "DELETE" });
    if (r.ok) carregar();
  }

  return (
    <div className="space-y-4">
      <Card className="flex gap-2.5 border-amber/30 bg-amber/5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
        <div className="text-xs leading-relaxed text-mist">
          Na API oficial, a <b className="text-amber">1ª mensagem a um contato novo</b> (cobrança fria) tem que ser um
          <b className="text-chalk"> modelo aprovado pela Meta</b>. A Meta revisa o texto — evite ameaça de ação judicial,
          menção a Serasa/SPC/score (os mesmos guardrails do robô) para não ser reprovado. Modelos de
          <b className="text-chalk"> marketing</b> têm custo maior; <b className="text-chalk">utility</b> é para algo já em andamento.
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-display font-600 text-chalk">Modelos na sua conta Meta</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          {!semWaba && <Button size="sm" onClick={() => setCriando((v) => !v)}><Plus className="h-4 w-4" /> Novo modelo</Button>}
        </div>
      </div>

      {erro && <p className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{erro}</p>}

      {semWaba && !carregando && (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <FileText className="h-7 w-7 text-mist" />
          <p className="max-w-sm text-sm text-mist">Nenhum número Meta (Cloud API) cadastrado ainda. Conecte um número oficial em <b className="text-chalk">Chips → Adicionar chip</b> para gerir templates.</p>
        </Card>
      )}

      {criando && (
        <Card className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>Nome do modelo (sem espaços)</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="abordagem_inicial" className="font-mono text-xs" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
                <option value="AUTHENTICATION">Authentication</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Corpo da mensagem</Label>
            <Textarea rows={4} value={corpo} onChange={(e) => setCorpo(e.target.value)}
              placeholder="Olá {{1}}, somos da {{2}}. Há uma condição especial para encerrar uma pendência sua de forma voluntária. Posso te explicar?" />
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-mist"><Info className="h-3 w-3 text-blue" /> Use {"{{1}}"}, {"{{2}}"} para os campos variáveis (nome, credor…).</p>
          </div>
          {numVars > 0 && (
            <div>
              <Label>Exemplos das variáveis (separe por "|")</Label>
              <Input value={exemplo} onChange={(e) => setExemplo(e.target.value)} placeholder="Maria | nossa loja" />
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={criar} disabled={salvando}>{salvando ? "Enviando…" : "Criar e submeter à Meta"}</Button>
            <Button variant="outline" size="sm" onClick={() => setCriando(false)}>Cancelar</Button>
          </div>
        </Card>
      )}

      {carregando ? (
        <p className="text-sm text-mist">Carregando modelos…</p>
      ) : (
        <div className="space-y-3">
          {lista.filter((t) => !t.erro).map((t) => (
            <Card key={`${t.waba_id}-${t.name}-${t.language}`} className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-sm text-chalk">{t.name}</span>
                  <Badge tone={TONE[t.status] ?? "neutral"}>{t.status}</Badge>
                  <Badge tone="neutral">{t.category}</Badge>
                  <Badge tone="neutral">{t.language}</Badge>
                  {t.quality_score && t.quality_score !== "UNKNOWN" && <Badge tone={t.quality_score === "GREEN" ? "green" : t.quality_score === "RED" ? "rose" : "amber"}>Qualidade {t.quality_score}</Badge>}
                </div>
                <button onClick={() => excluir(t)} className="text-mist hover:text-rose" title="Excluir"><Trash2 className="h-4 w-4" /></button>
              </div>
              {corpoDoTemplate(t.components) && <p className="rounded-lg border border-line bg-ink-850 px-3 py-2 text-xs text-mist">{corpoDoTemplate(t.components)}</p>}
              {t.status === "REJECTED" && t.rejected_reason && (
                <p className="text-[11px] text-rose">Reprovado: {t.rejected_reason}</p>
              )}
            </Card>
          ))}
          {lista.filter((t) => !t.erro).length === 0 && !semWaba && (
            <p className="text-sm text-mist">Nenhum modelo ainda. Crie o primeiro acima.</p>
          )}
        </div>
      )}
    </div>
  );
}
