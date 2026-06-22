"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, Input, Label, Button, Badge, Switch, HelpHint } from "@/components/ui/primitives";
import { FlaskConical, Send, CheckCircle2, Loader2, AlertTriangle, Save, Plus, Trash2 } from "lucide-react";

type Chip = { id: number; nome: string; status: string; papel?: string | null };
type NumeroTeste = { e164: string; label: string; ativo: boolean };

// Card dos "Números de teste" (vários) + botão "Enviar teste".
// Você cadastra um ou mais WhatsApps de teste; na hora do disparo escolhe qual número
// recebe a 1ª mensagem do bot e por qual chip. Aí responde do seu WhatsApp e o bot
// negocia em MODO TESTE (Pix sandbox/fake, sem mover dinheiro real).
export function TesteCard({ numerosIniciais, chips }: {
  numerosIniciais: NumeroTeste[]; chips: Chip[];
}) {
  const router = useRouter();
  const [numeros, setNumeros] = React.useState<NumeroTeste[]>(numerosIniciais);
  const [salvando, setSalvando] = React.useState(false);
  const [okMsg, setOkMsg] = React.useState("");
  const [erro, setErro] = React.useState("");

  // chips do BOT que estão conectados (pode disparar a partir deles)
  const disponiveis = chips.filter((c) => (c.papel ?? "bot") === "bot" && ["conectado", "aquecendo", "ativo"].includes(c.status));
  const [chipId, setChipId] = React.useState<number | "">(disponiveis[0]?.id ?? "");

  // o disparo só usa os números JÁ SALVOS e ativos (a Edge Function valida contra o config)
  const salvosAtivos = numerosIniciais.filter((n) => n.ativo && n.e164.trim());
  const [alvo, setAlvo] = React.useState<string>(salvosAtivos[0]?.e164 ?? "");
  const [enviando, setEnviando] = React.useState(false);
  const [resultado, setResultado] = React.useState<string>("");

  const sujo = JSON.stringify(numeros) !== JSON.stringify(numerosIniciais);

  function atualizar(i: number, patch: Partial<NumeroTeste>) {
    setNumeros((arr) => arr.map((n, idx) => (idx === i ? { ...n, ...patch } : n)));
  }
  function adicionar() { setNumeros((arr) => [...arr, { e164: "", label: "", ativo: true }]); }
  function remover(i: number) { setNumeros((arr) => arr.filter((_, idx) => idx !== i)); }

  async function salvar() {
    setSalvando(true); setErro(""); setOkMsg("");
    const limpos = numeros
      .map((n) => ({ e164: n.e164.trim(), label: n.label.trim(), ativo: !!n.ativo }))
      .filter((n) => n.e164);
    const r = await fetch("/api/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave: "numero_teste", valor: { numeros: limpos } }),
    });
    setSalvando(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErro(d.erro ?? "Falha ao salvar."); return; }
    setOkMsg("Números de teste salvos"); setTimeout(() => setOkMsg(""), 2500); router.refresh();
  }

  async function enviarTeste() {
    if (!chipId || !alvo) return;
    setEnviando(true); setErro(""); setResultado("");
    const r = await fetch("/api/chips/teste", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chip_id: chipId, numero_e164: alvo }),
    });
    const d = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok || !d.ok) { setErro(d.erro ?? "Falha ao disparar o teste."); return; }
    setResultado(`Mensagem de teste enviada para ${d.numero_teste}. Responda no WhatsApp desse número para conversar com o bot (modo teste).`);
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-4 border-amber/25">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
          <FlaskConical className="h-4 w-4 text-amber" /> Números de teste
          <HelpHint text="WhatsApps que recebem a 1ª mensagem quando você dispara um teste. Cadastre quantos quiser; na hora do disparo você escolhe qual recebe. O bot negocia em modo teste — Pix sandbox/fake, sem mover dinheiro real." />
        </h3>
        <Badge tone={salvosAtivos.length ? "amber" : "neutral"}>
          {salvosAtivos.length} ativo{salvosAtivos.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <p className="text-xs text-mist">
        Para testar o bot ponta a ponta sem incomodar ninguém: cadastre <b className="text-chalk">seus</b> WhatsApps aqui,
        salve, escolha um e clique em <b className="text-chalk">Enviar teste</b>. O bot manda a abordagem; você responde
        como se fosse o devedor.
      </p>

      {/* lista de números */}
      <div className="flex flex-col gap-2">
        {numeros.length === 0 && (
          <p className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-xs text-mist">
            Nenhum número de teste. Clique em “Adicionar número”.
          </p>
        )}
        {numeros.map((n, i) => (
          <div key={i} className="grid items-end gap-2 rounded-xl border border-line bg-ink-850 p-2.5 sm:grid-cols-[1fr_1fr_auto_auto]">
            <div>
              <Label className="text-xs">WhatsApp (+55 DDD número)</Label>
              <Input value={n.e164} onChange={(e) => atualizar(i, { e164: e.target.value })}
                     placeholder="+5511999998888" className="font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs">Apelido</Label>
              <Input value={n.label} onChange={(e) => atualizar(i, { label: e.target.value })}
                     placeholder="Meu Zap / Aparelho 2" />
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-900 px-3 py-2.5">
              <span className="text-xs text-mist">Ativo</span>
              <Switch checked={n.ativo} onChange={(v) => atualizar(i, { ativo: v })} />
            </div>
            <button type="button" onClick={() => remover(i)} aria-label="Remover"
                    className="grid h-10 w-10 place-items-center rounded-xl border border-line text-mist transition-colors hover:border-rose/40 hover:text-rose">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={adicionar}>
            <Plus className="h-4 w-4" /> Adicionar número
          </Button>
          <Button size="sm" onClick={salvar} disabled={salvando || !sujo}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </Button>
          {sujo && <span className="text-xs text-amber">alterações não salvas</span>}
        </div>
      </div>

      {/* disparo */}
      <div className="border-t border-line pt-3">
        {disponiveis.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-mist">
            <AlertTriangle className="h-3.5 w-3.5" /> Conecte um chip do bot (QR) para poder disparar o teste.
          </p>
        ) : salvosAtivos.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-mist">
            <AlertTriangle className="h-3.5 w-3.5" /> Cadastre e <b className="text-chalk">salve</b> ao menos um número de teste ativo para disparar.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label>Enviar para</Label>
              <select value={alvo} onChange={(e) => setAlvo(e.target.value)}
                      className="h-10 rounded-xl border border-line bg-ink-850 px-3 text-sm text-chalk outline-none">
                {salvosAtivos.map((n) => (
                  <option key={n.e164} value={n.e164}>{n.label ? `${n.label} — ${n.e164}` : n.e164}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>A partir do chip</Label>
              <select value={chipId} onChange={(e) => setChipId(Number(e.target.value))}
                      className="h-10 rounded-xl border border-line bg-ink-850 px-3 text-sm text-chalk outline-none">
                {disponiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <Button size="sm" onClick={enviarTeste} disabled={enviando || !alvo || !chipId}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar teste
            </Button>
          </div>
        )}
      </div>

      {okMsg && <p className="flex items-center gap-1.5 text-xs text-emerald"><CheckCircle2 className="h-3.5 w-3.5" /> {okMsg}</p>}
      {resultado && <p className="flex items-center gap-1.5 rounded-lg border border-emerald/30 bg-emerald/10 px-3 py-2 text-xs text-emerald-soft"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {resultado}</p>}
      {erro && <p className="flex items-center gap-1.5 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {erro}</p>}
    </Card>
  );
}
