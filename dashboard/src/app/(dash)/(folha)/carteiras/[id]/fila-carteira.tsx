"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { estiloBotao } from "@/components/ui/primitives";
import { cn, num } from "@/lib/utils";

export type ResumoFila = { acionaveis: number; nao_acionaveis: number; motivos: Record<string, number> };

const ORDENS = [
  { k: "prioridade", t: "Prioridade da importação", s: "Como sempre foi: a planilha decide." },
  { k: "antigos", t: "Mais antigos primeiro", s: "Vencimento mais antigo em aberto vem antes." },
  { k: "recentes", t: "Mais recentes primeiro", s: "Vencimento mais recente vem antes." },
] as const;

/**
 * A fila da carteira (V5.5.12/13/20): quantos dá para chamar agora, por que o resto não dá, a ordem
 * em que o robô e a lista seguem e as duas planilhas para trabalhar fora do sistema.
 */
export function FilaCarteira({ carteiraId, ordem, resumo, podeEditar }: { carteiraId: number; ordem: string; resumo: ResumoFila | null; podeEditar: boolean }) {
  const router = useRouter();
  const [atual, setAtual] = useState(ordem || "prioridade");
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const motivos = Object.entries(resumo?.motivos ?? {}).sort((a, b) => b[1] - a[1]);

  async function mudarOrdem(k: string) {
    if (k === atual) return;
    const antes = atual;
    setAtual(k); setGravando(true); setErro(null);
    const r = await fetch(`/api/carteiras/${carteiraId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordem_fila: k }) });
    const j = await r.json().catch(() => ({}));
    setGravando(false);
    if (!r.ok) { setAtual(antes); setErro(j?.erro ?? "Não foi possível mudar a ordem."); return; }
    router.refresh();
  }

  return (
    <section aria-labelledby="t-fila" className="rounded-painel border border-pauta bg-folha">
      <h3 id="t-fila" className="border-b border-pauta px-5 py-3.5 font-display text-titulo font-600 text-ouro">Fila da carteira</h3>
      <div className="grid gap-px bg-pauta lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="bg-folha px-5 py-4">
          {resumo ? (
            <>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-meta font-600 text-lapis">Acionáveis agora</dt>
                  <dd className="mt-0.5 font-mono text-[1.125rem] font-600 tabnums text-ouro">{num(resumo.acionaveis)}</dd>
                </div>
                <div>
                  <dt className="text-meta font-600 text-lapis">Não acionáveis</dt>
                  <dd className="mt-0.5 font-mono text-[1.125rem] font-600 tabnums text-texto">{num(resumo.nao_acionaveis)}</dd>
                </div>
              </dl>
              {motivos.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm2">
                  {motivos.map(([m, n]) => (
                    <li key={m} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 text-lapis">{m}</span>
                      <span className="font-mono tabnums text-texto">{num(n)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-meta text-lapis">Conta quem está ativo e ainda não pagou. Não acionável é quem pediu para parar, contestou, tem acordo em andamento ou precisa de higienização de contato.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <a href={`/api/carteiras/${carteiraId}/exportar?tipo=acionaveis`} download className={estiloBotao("outline")}><Download className="h-4 w-4" aria-hidden="true" /> Planilha acionáveis</a>
                <a href={`/api/carteiras/${carteiraId}/exportar?tipo=nao-acionaveis`} download className={estiloBotao("outline")}><Download className="h-4 w-4" aria-hidden="true" /> Planilha não acionáveis</a>
              </div>
            </>
          ) : (
            <p className="text-[0.9375rem] text-lapis">Sem devedores ativos nesta carteira.</p>
          )}
        </div>

        <div className="bg-folha px-5 py-4">
          <p className="font-700 text-texto" id="t-ordem">Ordem da fila</p>
          <p className="mt-0.5 text-sm2 text-lapis">Vale para a abordagem do robô, a lista de devedores desta carteira e as planilhas. Sem vencimento vai para o fim.</p>
          <div role="radiogroup" aria-labelledby="t-ordem" className="mt-3 space-y-1.5">
            {ORDENS.map((o) => (
              <button key={o.k} type="button" role="radio" aria-checked={atual === o.k} disabled={!podeEditar || gravando} onClick={() => mudarOrdem(o.k)}
                className={cn("flex w-full items-start gap-3 rounded-controle border px-3 py-2.5 text-left transition-colors duration-150 disabled:cursor-default",
                  atual === o.k ? "border-tinta bg-tinta-clara" : "border-pauta-forte hover:border-tinta/50")}>
                <span className={cn("mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border", atual === o.k ? "border-tinta" : "border-pauta-forte")} aria-hidden="true">
                  {atual === o.k && <span className="h-2 w-2 rounded-full bg-tinta" />}
                </span>
                <span>
                  <span className="block font-600 text-texto">{o.t}</span>
                  <span className="block text-sm2 text-lapis">{o.s}</span>
                </span>
              </button>
            ))}
          </div>
          {erro && <p role="alert" className="mt-2 text-sm2 text-margem">{erro}</p>}
        </div>
      </div>
    </section>
  );
}
