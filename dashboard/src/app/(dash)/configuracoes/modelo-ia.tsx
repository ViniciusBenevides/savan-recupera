"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Badge } from "@/components/ui/primitives";
import { Cpu, Sparkles, Coins, Scale, RefreshCw, Save, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

type Modelo = {
  id: string; label: string; descricao: string;
  entrada: number | null; saida: number | null;
  inteligencia: number | null; cobranca: number | null;
  disponivel: boolean; catalogado: boolean;
};
type Resposta = {
  modelos: Modelo[];
  recomendacoes: { custo_beneficio: string | null; cobranca: string | null };
  fonte: "openai" | "catalogo";
  aviso?: string;
};

const usd = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);

// Seletor do modelo de IA do robô. Busca os modelos que a conta da OpenAI acessa e
// sugere o melhor custo-benefício e o melhor para o cenário de cobrança. Salva em `ia.modelo`.
export function ModeloIA({ iaAtual }: { iaAtual: { nome_bot?: string; modelo?: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sel, setSel] = useState<string>(iaAtual.modelo ?? "gpt-4.1-mini");
  const [ok, setOk] = useState(false);

  async function buscar() {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/ia/modelos");
      if (!r.ok) throw new Error();
      setDados(await r.json());
    } catch {
      setErro("Não consegui buscar os modelos agora. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { buscar(); }, []);

  function salvar() {
    start(async () => {
      const r = await fetch("/api/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: [{ chave: "ia", valor: { ...iaAtual, modelo: sel } }] }),
      });
      if (r.ok) { setOk(true); setTimeout(() => setOk(false), 2500); router.refresh(); }
    });
  }

  const rec = dados?.recomendacoes;
  const mudou = sel !== (iaAtual.modelo ?? "gpt-4.1-mini");

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
            <Cpu className="h-4 w-4 text-violet" /> Modelo de IA do robô
          </h3>
          <p className="mt-1 text-xs text-mist">
            Qual modelo da OpenAI o robô usa para negociar. O sistema lista os modelos que a sua
            chave acessa e sugere os melhores para cobrança. Atual:{" "}
            <span className="font-mono text-chalk">{iaAtual.modelo ?? "gpt-4.1-mini"}</span>.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={buscar} disabled={carregando}>
          <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* legenda dos selos */}
      <div className="flex flex-wrap gap-2 text-[11px] text-mist">
        <span className="inline-flex items-center gap-1"><Badge tone="green"><Scale className="h-3 w-3" /> Melhor p/ cobrança</Badge> qualidade na negociação</span>
        <span className="inline-flex items-center gap-1"><Badge tone="amber"><Coins className="h-3 w-3" /> Custo-benefício</Badge> equilíbrio preço × qualidade</span>
      </div>

      {dados?.aviso && (
        <div className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{dados.aviso}</span>
        </div>
      )}
      {erro && (
        <div className="rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{erro}</div>
      )}

      {carregando && !dados ? (
        <div className="flex items-center gap-2 py-6 text-sm text-mist">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando modelos disponíveis…
        </div>
      ) : (
        <div className="grid gap-2.5">
          {dados?.modelos.map((m) => {
            const ativo = sel === m.id;
            const ehCobranca = rec?.cobranca === m.id;
            const ehCB = rec?.custo_beneficio === m.id;
            const desabilitado = !m.disponivel;
            return (
              <button
                type="button"
                key={m.id}
                disabled={desabilitado}
                onClick={() => setSel(m.id)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  ativo
                    ? "border-emerald/50 bg-emerald/10"
                    : desabilitado
                      ? "cursor-not-allowed border-line bg-ink-850 opacity-50"
                      : "border-line bg-ink-850 hover:border-mist/40"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-chalk">{m.label}</span>
                  {ehCobranca && <Badge tone="green"><Scale className="h-3 w-3" /> Melhor p/ cobrança</Badge>}
                  {ehCB && <Badge tone="amber"><Coins className="h-3 w-3" /> Custo-benefício</Badge>}
                  {!m.catalogado && <Badge tone="neutral">Sem dados de preço</Badge>}
                  {!m.disponivel && <Badge tone="rose">Sem acesso na chave</Badge>}
                  {ativo && <Badge tone="violet"><CheckCircle2 className="h-3 w-3" /> Selecionado</Badge>}
                </div>
                <p className="mt-1.5 text-xs text-mist">{m.descricao}</p>
                {m.catalogado && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mist">
                    <span>Entrada <span className="font-mono text-chalk">{usd(m.entrada)}</span> · Saída <span className="font-mono text-chalk">{usd(m.saida)}</span> <span className="text-mist/70">/ 1M tokens</span></span>
                    <span>Qualidade <span className="font-mono text-chalk">{m.inteligencia}</span> · Cobrança <span className="font-mono text-chalk">{m.cobranca}</span></span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-mist">
          <Sparkles className="mr-1 inline h-3 w-3 text-violet" />
          Sugestão para cobrança: <b className="text-chalk">{rec?.cobranca ?? "—"}</b> (qualidade)
          · custo-benefício: <b className="text-chalk">{rec?.custo_beneficio ?? "—"}</b>.
        </p>
        <Button size="sm" onClick={salvar} disabled={pending || !mudou}>
          {ok ? <><CheckCircle2 className="h-4 w-4" /> Salvo</> : <><Save className="h-4 w-4" /> Salvar modelo</>}
        </Button>
      </div>
    </Card>
  );
}
