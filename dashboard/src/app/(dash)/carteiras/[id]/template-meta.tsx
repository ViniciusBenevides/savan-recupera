"use client";
import * as React from "react";
import { Label, Button, Badge, HelpHint } from "@/components/ui/primitives";
import { Loader2, CheckCircle2, AlertTriangle, Cloud } from "lucide-react";

type Tpl = { name: string; language: string; category: string; texto: string; n_variaveis: number };

const ROTULO_VAR: Record<string, string> = {
  primeiro_nome: "Primeiro nome",
  nome: "Nome completo",
  credor: "Credor da carteira",
  nome_bot: "Nome do robô",
  saudacao: "Saudação (bom dia/tarde/noite)",
};

/**
 * Escolha do modelo de abordagem no canal oficial da Meta.
 *
 * Aqui não se escreve texto: fora da janela de 24h a Cloud API só aceita modelo que a Meta já
 * aprovou, palavra por palavra. O que existe é escolher entre os aprovados e dizer o que entra em
 * cada `{{n}}` — e é isso que o `campanha-lote` usa para montar a mensagem.
 */
export function TemplateMetaAbordagem({ carteiraId }: { carteiraId: number }) {
  const [templates, setTemplates] = React.useState<Tpl[] | null>(null);
  const [disponiveis, setDisponiveis] = React.useState<string[]>([]);
  const [nome, setNome] = React.useState("");
  const [idioma, setIdioma] = React.useState("pt_BR");
  const [vars, setVars] = React.useState<string[]>([]);
  const [salvando, setSalvando] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/carteiras/${carteiraId}/template-abordagem`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        if (d?.erro) { setErro(d.erro); setTemplates([]); return; }
        setTemplates(d.templates ?? []);
        setDisponiveis(d.variaveis_disponiveis ?? []);
        if (d.atual?.name) {
          setNome(d.atual.name);
          setIdioma(d.atual.language ?? "pt_BR");
          setVars(d.atual.variaveis ?? []);
        }
      })
      .catch(() => { if (vivo) { setErro("Falha ao carregar os modelos."); setTemplates([]); } });
    return () => { vivo = false; };
  }, [carteiraId]);

  const escolhido = (templates ?? []).find((t) => t.name === nome && t.language === idioma) ?? null;

  function trocarModelo(valor: string) {
    setMsg(null); setErro(null);
    const [n, lang] = valor.split("|");
    setNome(n); setIdioma(lang);
    const t = (templates ?? []).find((x) => x.name === n && x.language === lang);
    // Ao trocar de modelo, o mapeamento antigo raramente serve: preserva o que couber e completa
    // o resto com o primeiro nome, que é o preenchimento certo na esmagadora maioria dos casos.
    const n_vars = t?.n_variaveis ?? 0;
    setVars(Array.from({ length: n_vars }, (_, i) => vars[i] ?? "primeiro_nome"));
  }

  async function salvar() {
    setSalvando(true); setErro(null); setMsg(null);
    try {
      const r = await fetch(`/api/carteiras/${carteiraId}/template-abordagem`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome, language: idioma, variaveis: vars }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d.erro ?? "Falha ao salvar."); return; }
      setMsg("Modelo de abordagem definido.");
    } catch { setErro("Falha ao salvar."); }
    finally { setSalvando(false); }
  }

  // Prévia com as variáveis já no lugar dos {{n}}, para a escolha ser informada.
  const previa = escolhido
    ? escolhido.texto.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
        const v = vars[Number(n) - 1];
        return v ? `«${ROTULO_VAR[v] ?? v}»` : "«?»";
      })
    : "";

  return (
    <div className="rounded-xl border border-line bg-ink-900 p-3">
      <Label className="flex items-center gap-1.5 text-xs">
        <Cloud className="h-3.5 w-3.5 text-emerald" /> Modelo aprovado da Meta
        <HelpHint text="No canal oficial a 1ª mensagem não é texto livre: a Meta só aceita um modelo que ela mesma aprovou, palavra por palavra. Por isso aqui você escolhe entre os aprovados, em vez de escrever." />
      </Label>

      {templates === null ? (
        <div className="flex items-center gap-2 py-3 text-xs text-mist">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando modelos aprovados…
        </div>
      ) : templates.length === 0 ? (
        <p className="mt-2 text-[11px] leading-relaxed text-mist">
          Nenhum modelo aprovado no cache. Atualize em{" "}
          <a href="/ajustes?aba=modelos" className="text-emerald-soft underline">Ajustes → Modelos</a> —
          sem modelo aprovado o disparador pula o chip com <b className="text-chalk">meta_template_ausente</b>.
        </p>
      ) : (
        <>
          <select
            value={escolhido ? `${escolhido.name}|${escolhido.language}` : ""}
            onChange={(e) => trocarModelo(e.target.value)}
            className="mt-2 h-9 w-full rounded-lg border border-line bg-ink-850 px-2.5 text-xs text-chalk outline-none focus:border-emerald"
          >
            <option value="">— escolha um modelo —</option>
            {templates.map((t) => (
              <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                {t.name} ({t.language}) · {t.category}
              </option>
            ))}
          </select>

          {escolhido && (
            <>
              <div className="mt-2 whitespace-pre-wrap rounded-lg border border-line bg-ink-850 px-2.5 py-2 text-[11px] leading-relaxed text-chalk">
                {previa}
              </div>
              {escolhido.category?.toUpperCase() === "MARKETING" && (
                <p className="mt-1.5 flex gap-1.5 text-[10px] text-amber">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  Modelo de categoria <b>marketing</b>: custa mais por conversa e pesa mais na
                  qualidade do número do que um <b>utility</b>.
                </p>
              )}
              {escolhido.n_variaveis > 0 && (
                <div className="mt-2 space-y-1.5">
                  <span className="block text-[10px] text-mist">O que entra em cada campo do modelo</span>
                  {Array.from({ length: escolhido.n_variaveis }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-10 shrink-0 font-mono text-[11px] text-mist">{`{{${i + 1}}}`}</span>
                      <select
                        value={vars[i] ?? ""}
                        onChange={(e) => {
                          const proximo = Array.from({ length: escolhido.n_variaveis }, (_, m) => vars[m] ?? "");
                          proximo[i] = e.target.value;
                          setVars(proximo);
                        }}
                        className="h-8 flex-1 rounded-lg border border-line bg-ink-850 px-2 text-[11px] text-chalk outline-none focus:border-emerald"
                      >
                        <option value="">— escolha —</option>
                        {disponiveis.map((v) => (
                          <option key={v} value={v}>{ROTULO_VAR[v] ?? v}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[10px] leading-relaxed text-mist">
                Vale para <b className="text-chalk">todas as carteiras deste cobrador</b> — o modelo de
                abordagem é configuração da conta, não da carteira.
              </p>
            </>
          )}

          {erro && <p className="mt-2 text-[11px] text-rose">{erro}</p>}
          {msg && <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald"><CheckCircle2 className="h-3 w-3" /> {msg}</p>}

          <Button size="sm" className="mt-2 w-full" onClick={salvar}
                  disabled={salvando || !escolhido || vars.some((v) => !v) || vars.length !== (escolhido?.n_variaveis ?? 0)}>
            {salvando ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</> : "Usar este modelo"}
          </Button>
        </>
      )}
    </div>
  );
}
