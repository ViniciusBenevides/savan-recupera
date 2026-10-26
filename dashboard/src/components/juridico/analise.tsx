"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Button, estiloBotao } from "@/components/ui/primitives";
import type { Analise } from "@/lib/juridico/tipos";
import { brl, cn } from "@/lib/utils";
import { dataLonga, hora } from "@/lib/datas";

const FORCA: Record<string, string> = { ALTA: "prova forte", "MÉDIA": "prova média", BAIXA: "prova fraca" };

/**
 * Uma análise jurídica inteira, na ordem em que o advogado confere (V5.6.00): o que o motor leu,
 * o que falta, os riscos, a fundamentação, a defesa provável, a estratégia, as fontes do dia, a
 * jurisprudência e a minuta. Aprovar e abrir o caso ficam no fim, depois de ler.
 */
export function AnaliseDetalhe({ a, podeDecidir, temCaso, compacta }: { a: Analise; podeDecidir: boolean; temCaso: boolean; compacta?: boolean }) {
  const router = useRouter();
  const [gravando, setGravando] = useState<"aprovar" | "criar_caso" | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const aprovada = a.status === "APROVADA";
  const fresca = !!a.fontes_verificadas_em;
  const valoresDocs = a.fatos?.valoresDocumentos ?? [];
  const datasDocs = a.fatos?.datasDocumentos ?? [];
  const jur = a.jurisprudencia ?? { ativa: false, resumo: "", precedentes: [], fontes: [] };

  async function decidir(acao: "aprovar" | "criar_caso") {
    setGravando(acao); setAviso(null);
    const r = await fetch(`/api/juridico/analises/${a.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }) });
    const j = await r.json().catch(() => ({}));
    setGravando(null);
    if (!r.ok) { setAviso({ tipo: "erro", msg: j?.erro ?? "Não foi possível concluir." }); return; }
    setAviso({ tipo: "ok", msg: acao === "aprovar" ? "Análise aprovada. Confira a minuta antes de qualquer protocolo." : "Caso aberto na etapa Ajuizamento. O protocolo continua com o advogado." });
    router.refresh();
  }

  return (
    <article id={`analise-${a.id}`} className="scroll-mt-24">
      {!compacta && (
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-display text-titulo font-600 text-ouro">{a.medida}</h3>
          <p className={cn("text-sm2 font-600", aprovada ? "text-pago" : "text-atencao")}>
            {aprovada ? `Aprovada por ${a.aprovado_por_nome ?? "advogado"} em ${a.aprovado_em ? dataLonga(a.aprovado_em) : "—"}` : "Rascunho: falta a aprovação do advogado"}
          </p>
        </header>
      )}
      <p className="mt-1 text-meta text-lapis">
        Análise #{a.id} · {dataLonga(a.criado_em)} às {hora(a.criado_em)}{a.criado_por_nome ? ` · ${a.criado_por_nome}` : ""} · motor {a.versao_motor}{a.modelo_ia ? ` · ${a.modelo_ia}` : ""}
      </p>

      <dl className="mt-3 grid grid-cols-2 overflow-hidden border-y border-pauta bg-folha sm:grid-cols-4">
        <Fato rotulo="Valor analisado" valor={brl(Number(a.saldo))} mono />
        <Fato rotulo="Vencimentos" valor={a.primeiro_venc ? (a.primeiro_venc === a.ultimo_venc ? dataLonga(a.primeiro_venc) : `${dataLonga(a.primeiro_venc)} a ${dataLonga(a.ultimo_venc ?? a.primeiro_venc)}`) : "sem data"} mono />
        <Fato rotulo="Anos" valor={a.anos?.length ? a.anos.join(", ") : "—"} mono />
        <Fato rotulo="Confiança da triagem" valor={`${a.confianca}%`} nota={FORCA[a.forca_prova ?? ""] ?? "prova média"} mono />
      </dl>
      {a.alternativa && <p className="mt-3 text-[0.9375rem]"><span className="text-lapis">Se não der: </span>{a.alternativa}</p>}
      {!fresca && (
        <p className="mt-3 rounded-controle bg-atencao-fundo px-3 py-2 text-sm2 text-atencao">
          Análise preliminar: a lei usada não foi confirmada na fonte oficial no dia. A aprovação confere de novo e só passa com as fontes do dia.
        </p>
      )}

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <Lista titulo="O que falta nos documentos" itens={a.pendencias ?? []} vazio="Nenhuma pendência apontada pelo motor." />
        <Lista titulo="Riscos e pontos de revisão" itens={a.riscos ?? []} vazio="Sem alerta objetivo registrado." />
      </div>
      {(valoresDocs.length > 0 || datasDocs.length > 0) && (
        <p className="mt-4 text-sm2 text-lapis">
          Lido nos documentos: {valoresDocs.length ? valoresDocs.map((v) => brl(v)).join(", ") : "nenhum valor"}{datasDocs.length ? ` · datas ${datasDocs.slice(0, 8).map((d) => dataLonga(d)).join(", ")}` : ""}
        </p>
      )}

      <div className="mt-5 divide-y divide-pauta border-y border-pauta">
        <Bloco titulo="Fundamentação" aberto texto={a.fundamentacao} />
        <Bloco titulo="Defesa provável do devedor" texto={a.defesa} />
        <Bloco titulo="Estratégia recomendada" texto={a.estrategia} />
        <details className="group py-3">
          <Resumo>Fontes oficiais desta análise <span className="font-500 text-lapis">({a.fontes?.length ?? 0})</span></Resumo>
          <ul className="mt-2 space-y-1.5 text-sm2">
            {(a.fontes ?? []).map((f) => (
              <li key={f.chave} className="flex flex-wrap items-baseline gap-x-2">
                <a href={f.url} target="_blank" rel="noopener" className="font-600 text-texto hover:text-tinta hover:underline">{f.nome}</a>
                <span className={cn("font-600", f.fresca ? "text-pago" : "text-atencao")}>{f.fresca ? "confirmada no dia" : f.status === "NUNCA_VERIFICADA" ? "nunca verificada" : "não confirmada no dia"}</span>
                {f.ok_em && <span className="font-mono text-lapis">{dataLonga(f.ok_em)} {hora(f.ok_em)}</span>}
                {f.alterada && <span className="basis-full font-600 text-margem">Mudou na fonte oficial: {f.resumo || "conferir os artigos"}</span>}
              </li>
            ))}
            {!a.fontes?.length && <li className="text-lapis">Nenhuma fonte registrada.</li>}
          </ul>
        </details>
        <details className="group py-3">
          <Resumo>Jurisprudência pesquisada <span className="font-500 text-lapis">({jur.precedentes?.length ?? 0} {jur.precedentes?.length === 1 ? "decisão" : "decisões"})</span></Resumo>
          <p className="mt-2 max-w-[75ch] whitespace-pre-line text-[0.9375rem]">{jur.resumo || "Pesquisa jurisprudencial não executada."}</p>
          {(jur.precedentes ?? []).length > 0 && (
            <ul className="mt-3 space-y-3">
              {jur.precedentes.map((p, i) => (
                <li key={i} className="border-l border-pauta-forte pl-3 text-sm2">
                  <p className="font-600 text-texto">{p.tribunal}{p.tipo ? ` · ${p.tipo}` : ""}{p.processo ? ` · ${p.processo}` : ""}{p.data ? ` · ${p.data}` : ""}</p>
                  <p className="mt-0.5 max-w-[75ch] text-[0.9375rem]">{p.tese}</p>
                  {p.relevancia && <p className="mt-0.5 text-lapis">{p.relevancia}</p>}
                  {p.url && <a href={p.url} target="_blank" rel="noopener" className="mt-1 inline-flex items-center gap-1 font-600 text-tinta hover:underline">Abrir no site do tribunal <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>}
                </li>
              ))}
            </ul>
          )}
        </details>
        <details className="group py-3">
          <Resumo>Minuta</Resumo>
          <textarea readOnly value={a.minuta ?? ""} aria-label="Minuta automática" rows={16}
            className="mt-2 w-full rounded-controle border border-pauta-forte bg-papel px-3 py-2.5 font-mono text-sm2 leading-6 text-texto outline-none focus:border-tinta" />
        </details>
      </div>

      {aviso && <p role="status" className={cn("mt-4 rounded-controle px-3 py-2 text-sm2", aviso.tipo === "ok" ? "bg-pago-fundo text-pago" : "bg-margem-fundo text-margem")}>{aviso.msg}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {podeDecidir && !aprovada && (
          <Button onClick={() => decidir("aprovar")} disabled={gravando !== null}>{gravando === "aprovar" ? "Conferindo as fontes…" : "Aprovar como advogado"}</Button>
        )}
        {podeDecidir && aprovada && !temCaso && (
          <Button onClick={() => decidir("criar_caso")} disabled={gravando !== null}>{gravando === "criar_caso" ? "Abrindo…" : "Criar caso para ajuizamento"}</Button>
        )}
        {aprovada && temCaso && <span className="text-sm2 font-600 text-pago">Já virou caso jurídico.</span>}
        <a href={`/api/juridico/analises/${a.id}/minuta`} className={estiloBotao("outline")}>Baixar minuta (.txt)</a>
      </div>
    </article>
  );
}

function Fato({ rotulo, valor, mono, nota }: { rotulo: string; valor: string; mono?: boolean; nota?: string }) {
  return (
    <div className="min-w-0 px-3 py-3 shadow-[1px_0_0_0_rgb(var(--c-line)),0_1px_0_0_rgb(var(--c-line))] sm:px-4">
      <dt className="text-meta font-600 text-lapis">{rotulo}</dt>
      <dd className={cn("mt-0.5 font-600", mono && "font-mono text-[0.9375rem] tabnums")}>{valor}</dd>
      {nota && <dd className="text-meta text-lapis">{nota}</dd>}
    </div>
  );
}

function Lista({ titulo, itens, vazio }: { titulo: string; itens: string[]; vazio: string }) {
  return (
    <section>
      <h4 className="font-700 text-texto">{titulo}</h4>
      {itens.length ? (
        <ul className="mt-2 space-y-1.5">
          {itens.map((x, i) => (
            <li key={i} className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-2 text-[0.9375rem]">
              <span className="mt-[0.55rem] h-1.5 w-1.5 rounded-full bg-atencao" aria-hidden="true" />
              {x}
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-[0.9375rem] text-pago">{vazio}</p>}
    </section>
  );
}

// Cabeçalho de seção que abre e fecha: a seta gira para mostrar o estado
export function Resumo({ children }: { children: ReactNode }) {
  return (
    <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 font-600 text-texto hover:text-tinta [&::-webkit-details-marker]:hidden">
      <ChevronRight className="h-4 w-4 shrink-0 text-tinta transition-transform duration-150 ease-saida group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
      <span>{children}</span>
    </summary>
  );
}

function Bloco({ titulo, texto, aberto }: { titulo: string; texto: string | null; aberto?: boolean }) {
  return (
    <details className="group py-3" open={aberto}>
      <Resumo>{titulo}</Resumo>
      <p className="mt-2 max-w-[75ch] whitespace-pre-line text-[0.9375rem] leading-relaxed">{texto || "—"}</p>
    </details>
  );
}
