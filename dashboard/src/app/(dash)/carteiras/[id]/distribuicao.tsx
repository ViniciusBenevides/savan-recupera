"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Label, Badge, HelpHint } from "@/components/ui/primitives";
import { num } from "@/lib/utils";
import { Network, Sparkles, Loader2, CheckCircle2, Smartphone, MapPin, Clock, AlertTriangle } from "lucide-react";

type Plano = { chip_id: number; nome: string; ufs: string[]; cidades: string[]; volume: number; eta_dias: number; limite_pico: number };
type Sugestao = {
  total: number; recomendada: string; estrategia: string; planos: Plano[];
  explicacao: string; n_chips: number; sem_chips?: boolean;
};

const OPCOES = [
  { k: "igualitario", t: "Igualitário", d: "Divide o volume entre os chips, proporcional à capacidade de cada um." },
  { k: "uf", t: "Por estado (UF)", d: "Cada chip atende estados inteiros — bom para reaproveitar DDD/contexto regional." },
  { k: "cidade", t: "Por cidade", d: "Cada chip atende cidades inteiras — divisão geográfica mais fina." },
] as const;

export function DistribuicaoCard({ carteira }: { carteira: any }) {
  const router = useRouter();
  const [estrategia, setEstrategia] = React.useState<string>(carteira.estrategia_distribuicao ?? "igualitario");
  const [sug, setSug] = React.useState<Sugestao | null>(null);
  const [carregando, setCarregando] = React.useState(false);
  const [aplicando, setAplicando] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  async function verSugestao(estr: string) {
    setEstrategia(estr); setCarregando(true); setErro(null); setMsg(null); setSug(null);
    try {
      const r = await fetch(`/api/carteiras/${carteira.id}/sugestao-distribuicao?estrategia=${estr}`);
      const d = await r.json();
      if (!r.ok) { setErro(d.erro ?? "Falha ao calcular a sugestão."); return; }
      setSug(d);
    } catch { setErro("Falha ao calcular a sugestão."); }
    finally { setCarregando(false); }
  }

  async function aplicar() {
    if (!sug) return;
    setAplicando(true); setErro(null); setMsg(null);
    const atribuicoes = estrategia === "uf"
      ? sug.planos.map((p) => ({ chip_id: p.chip_id, ufs: p.ufs }))
      : estrategia === "cidade"
      ? sug.planos.map((p) => ({ chip_id: p.chip_id, cidades: p.cidades }))
      : [];
    try {
      const r = await fetch(`/api/carteiras/${carteira.id}/distribuir`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estrategia, atribuicoes }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d.erro ?? "Falha ao aplicar."); return; }
      setMsg(`Distribuição aplicada: ${num(d.designados)} devedor(es) designados a um chip.`);
      router.refresh();
    } catch { setErro("Falha ao aplicar."); }
    finally { setAplicando(false); }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="mb-0 flex items-center gap-1.5">
          <Network className="h-4 w-4 text-emerald" /> Distribuição entre chips
          <HelpHint text="Como os devedores desta carteira são divididos entre os chips. Cada chip respeita o próprio aquecimento; ninguém recebe a mesma pessoa duas vezes." />
        </Label>
        <Badge tone="neutral">Atual: {OPCOES.find((o) => o.k === estrategia)?.t ?? estrategia}</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {OPCOES.map((o) => {
          const ativa = estrategia === o.k;
          const recomendada = sug?.recomendada === o.k;
          return (
            <button key={o.k} onClick={() => verSugestao(o.k)}
              className={`rounded-xl border p-3 text-left transition-colors ${ativa ? "border-emerald/50 bg-emerald/8" : "border-line bg-ink-850 hover:border-ink-500"}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-chalk">{o.t}</span>
                {recomendada && <Badge tone="green">Sugerido</Badge>}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-mist">{o.d}</p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => verSugestao(estrategia)} disabled={carregando}>
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Ver sugestão do sistema
        </Button>
        {sug && !sug.sem_chips && (
          <Button size="sm" onClick={aplicar} disabled={aplicando}>
            {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aplicar distribuição
          </Button>
        )}
      </div>

      {erro && <p className="flex items-center gap-1.5 text-xs text-rose"><AlertTriangle className="h-3.5 w-3.5" /> {erro}</p>}
      {msg && <p className="flex items-center gap-1.5 text-xs text-emerald"><CheckCircle2 className="h-3.5 w-3.5" /> {msg}</p>}

      {sug?.sem_chips && (
        <p className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
          Nenhum chip cadastrado/utilizável. Cadastre e ative chips em <b>Chips</b> antes de distribuir.
        </p>
      )}

      {sug && !sug.sem_chips && (
        <div className="space-y-3">
          <p className="flex gap-2 rounded-lg border border-line bg-ink-850 px-3 py-2.5 text-[11px] leading-relaxed text-mist">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue" />
            {sug.explicacao} <b className="text-chalk">Total na fila: {num(sug.total)}.</b>
          </p>

          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-ink-850 text-left text-[11px] uppercase tracking-wider text-mist">
                  <th className="px-3 py-2 font-medium"><Smartphone className="inline h-3.5 w-3.5" /> Chip</th>
                  <th className="px-3 py-2 font-medium"><MapPin className="inline h-3.5 w-3.5" /> Região</th>
                  <th className="px-3 py-2 text-right font-medium">Volume</th>
                  <th className="px-3 py-2 text-right font-medium"><Clock className="inline h-3.5 w-3.5" /> ETA</th>
                </tr>
              </thead>
              <tbody>
                {sug.planos.map((p) => {
                  const regiao = estrategia === "uf" ? (p.ufs.join(", ") || "—")
                    : estrategia === "cidade" ? (p.cidades.length ? `${p.cidades.length} cidade(s)` : "—")
                    : "todas (rateio)";
                  return (
                    <tr key={p.chip_id} className="border-b border-line/50 last:border-0">
                      <td className="px-3 py-2 text-chalk">{p.nome}</td>
                      <td className="px-3 py-2 text-mist">{regiao}</td>
                      <td className="px-3 py-2 text-right font-mono text-chalk tabnums">{num(p.volume)}</td>
                      <td className="px-3 py-2 text-right font-mono text-mist tabnums">{p.eta_dias ? `~${p.eta_dias}d` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-mist">
            ETA = dias estimados para o chip esvaziar a pilha dele, contados a partir da ativação, já respeitando o aquecimento.
            Devedores sem UF/cidade conhecida ficam no <b className="text-chalk">pool livre</b> (qualquer chip pega).
          </p>
        </div>
      )}
    </Card>
  );
}
