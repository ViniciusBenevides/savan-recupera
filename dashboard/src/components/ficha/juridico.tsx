"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { AnaliseDetalhe, Resumo } from "@/components/juridico/analise";
import { CasosLista, NovoCaso } from "@/components/juridico/casos";
import { ESPECIES_TITULO, type Analise, type Caso } from "@/lib/juridico/tipos";
import { brl, cn } from "@/lib/utils";
import { dataLonga, deDiaISO, diasEntre } from "@/lib/datas";

type Titulo = { especie: string | null; emissao: string | null; prescricao: string | null; observacao: string | null };

/**
 * Aba Jurídico da ficha (V5.6.00): analisar o caso, ler a análise, aprovar como advogado e
 * acompanhar o processo. Os dados do título ficam ao lado porque são eles que mudam a medida.
 */
export function JuridicoFicha({ devedor, analises, casos, documentos, podeOperar, podeJuridico, irParaDocumentos }: {
  devedor: { id: number; saldo: number; vencimento: string | null; situacao: string; titulo: Titulo };
  analises: Analise[]; casos: Caso[]; documentos: number; podeOperar: boolean; podeJuridico: boolean; irParaDocumentos: () => void;
}) {
  const router = useRouter();
  const [vendo, setVendo] = useState<number | null>(analises[0]?.id ?? null);
  const [analisando, setAnalisando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const atual = analises.find((a) => a.id === vendo) ?? analises[0] ?? null;
  const casoDe = new Set(casos.map((c) => c.analise_id).filter(Boolean));
  const anos = devedor.vencimento ? Math.floor(diasEntre(deDiaISO(devedor.vencimento), new Date()) / 365.25) : null;
  const pago = devedor.situacao === "pago" || devedor.saldo <= 0;

  async function analisar() {
    setAnalisando(true); setAviso(null);
    const r = await fetch("/api/juridico/analisar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ devedor_id: devedor.id, usar_ia: true }) });
    const j = await r.json().catch(() => ({}));
    setAnalisando(false);
    if (!r.ok) { setAviso({ tipo: "erro", msg: j?.erro ?? "Não foi possível analisar." }); return; }
    setVendo(j.analise_id);
    setAviso(j.fontes_do_dia
      ? { tipo: "ok", msg: `Análise pronta: ${j.medida}, confiança ${j.confianca}%. Leia antes de aprovar.` }
      : { tipo: "erro", msg: "Análise preliminar: a lei usada não foi confirmada na fonte oficial hoje, então a aprovação fica travada. Sincronize as fontes na tela do Jurídico." });
    router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-8">
        <section aria-labelledby="t-analise">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 id="t-analise" className="font-display text-titulo font-600 text-ouro">Análise jurídica</h2>
              <p className="mt-1 max-w-[62ch] text-[0.9375rem] text-lapis">
                O motor cruza valor, vencimento, título, documentos e a lei oficial do dia. Sugere a medida; quem aprova é o advogado, e nada é protocolado sozinho.
              </p>
            </div>
            {podeJuridico && (
              <Button onClick={analisar} disabled={analisando || pago}>{analisando ? "Analisando… (até 1 minuto)" : analises.length ? "Analisar de novo" : "Analisar caso e gerar minuta"}</Button>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 overflow-hidden border-y border-pauta bg-folha sm:grid-cols-4">
            <Fato rotulo="Saldo em aberto" valor={pago ? "quitado" : brl(devedor.saldo)} mono />
            <Fato rotulo="Vencimento" valor={devedor.vencimento ? dataLonga(devedor.vencimento) : "sem data"} nota={anos != null && anos > 0 ? `há ${anos} ${anos === 1 ? "ano" : "anos"}` : undefined} mono />
            <Fato rotulo="Prescrição conferida" valor={devedor.titulo.prescricao ? dataLonga(devedor.titulo.prescricao) : "não informada"} tom={devedor.titulo.prescricao ? undefined : "text-atencao"} mono={!!devedor.titulo.prescricao} />
            <div className="min-w-0 px-3 py-3 shadow-[1px_0_0_0_rgb(var(--c-line)),0_1px_0_0_rgb(var(--c-line))] sm:px-4">
              <dt className="text-meta font-600 text-lapis">Documentos</dt>
              <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-600">
                <span className="font-mono tabnums">{documentos}</span>
                <button type="button" onClick={irParaDocumentos} className="alvo-toque text-sm2 font-600 text-tinta hover:underline">{documentos ? "ver" : "anexar"}</button>
              </dd>
            </div>
          </dl>
          {aviso && <p role="status" className={cn("mt-4 rounded-controle px-3 py-2 text-sm2", aviso.tipo === "ok" ? "bg-pago-fundo text-pago" : "bg-atencao-fundo text-atencao")}>{aviso.msg}</p>}

          <div className="mt-6">
            {atual ? (
              <AnaliseDetalhe key={atual.id} a={atual} podeDecidir={podeJuridico} temCaso={casoDe.has(atual.id)} />
            ) : (
              <p className="text-[0.9375rem] text-lapis">
                {pago ? "Dívida quitada: nada a analisar." : "Nenhuma análise ainda. Preencha os dados do título ao lado e anexe os documentos que tiver antes de analisar: eles mudam a medida sugerida."}
              </p>
            )}
          </div>

          {analises.length > 1 && (
            <details className="group mt-6">
              <Resumo>Análises anteriores <span className="font-500 text-lapis">({analises.length - 1})</span></Resumo>
              <ul className="mt-2 divide-y divide-pauta border-y border-pauta bg-folha">
                {analises.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => { setVendo(a.id); document.getElementById(`analise-${a.id}`)?.scrollIntoView({ block: "start" }); }}
                      aria-current={a.id === atual?.id ? "true" : undefined}
                      className={cn("linha-hover grid w-full grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left", a.id === atual?.id && "bg-tinta-clara")}>
                      <span className="font-mono text-sm2 text-tinta tabnums">{dataLonga(a.criado_em)}</span>
                      <span className="min-w-0 truncate">{a.medida} <span className="text-sm2 text-lapis">· {a.confianca}%</span></span>
                      <span className={cn("text-sm2 font-600", a.status === "APROVADA" ? "text-pago" : "text-lapis")}>{a.status === "APROVADA" ? "Aprovada" : "Rascunho"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section aria-labelledby="t-casos">
          <h2 id="t-casos" className="font-display text-titulo font-600 text-ouro">Casos jurídicos</h2>
          <CasosLista casos={casos} podeDecidir={podeJuridico} />
        </section>
      </div>

      <aside className="space-y-6">
        <DadosTitulo devedorId={devedor.id} titulo={devedor.titulo} podeEditar={podeOperar} />
        {podeJuridico && !pago && (
          <section aria-labelledby="t-novo-caso" className="rounded-painel border border-pauta bg-folha p-4">
            <details className="group">
              <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <h2 id="t-novo-caso" className="font-display text-titulo font-600 text-ouro">Novo caso</h2>
                <span className="text-sm2 font-600 text-tinta group-open:hidden">Abrir sem análise</span>
              </summary>
              <p className="mb-3 mt-1 text-sm2 text-lapis">Para o processo que já existe ou que o advogado decidiu sem passar pela análise.</p>
              <NovoCaso devedorId={devedor.id} acao={atual?.medida ?? "Ação de cobrança"} valor={devedor.saldo} />
            </details>
          </section>
        )}
      </aside>
    </div>
  );
}

function Fato({ rotulo, valor, mono, tom, nota }: { rotulo: string; valor: string; mono?: boolean; tom?: string; nota?: string }) {
  return (
    <div className="min-w-0 px-3 py-3 shadow-[1px_0_0_0_rgb(var(--c-line)),0_1px_0_0_rgb(var(--c-line))] sm:px-4">
      <dt className="text-meta font-600 text-lapis">{rotulo}</dt>
      <dd className={cn("mt-0.5 font-600", mono && "font-mono text-[0.9375rem] tabnums", tom)}>{valor}</dd>
      {nota && <dd className="text-meta text-lapis">{nota}</dd>}
    </div>
  );
}

/** Espécie, emissão e prescrição conferida: o que a planilha não traz e a triagem precisa. */
function DadosTitulo({ devedorId, titulo, podeEditar }: { devedorId: number; titulo: Titulo; podeEditar: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ especie: titulo.especie ?? "", emissao: titulo.emissao ?? "", prescricao: titulo.prescricao ?? "", observacao: titulo.observacao ?? "" });
  const [gravando, setGravando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const mudou = f.especie !== (titulo.especie ?? "") || f.emissao !== (titulo.emissao ?? "") || f.prescricao !== (titulo.prescricao ?? "") || f.observacao !== (titulo.observacao ?? "");

  async function salvar() {
    setGravando(true); setAviso(null);
    const r = await fetch(`/api/devedores/${devedorId}/titulo`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo_especie: f.especie, titulo_emissao: f.emissao, prescricao_em: f.prescricao, titulo_observacao: f.observacao }),
    });
    const j = await r.json().catch(() => ({}));
    setGravando(false);
    if (!r.ok) { setAviso({ tipo: "erro", msg: j?.erro ?? "Não foi possível salvar." }); return; }
    setAviso({ tipo: "ok", msg: "Salvo. A próxima análise já usa estes dados." });
    router.refresh();
  }

  return (
    <section aria-labelledby="t-titulo" className="rounded-painel border border-pauta bg-folha p-4">
      <h2 id="t-titulo" className="font-display text-titulo font-600 text-ouro">Dados do título</h2>
      <fieldset disabled={!podeEditar} className="mt-3 space-y-3">
        <div>
          <Label htmlFor="tit-especie">Espécie</Label>
          <Select id="tit-especie" value={f.especie} onChange={(e) => setF({ ...f, especie: e.target.value })}>
            <option value="">Não informada</option>
            {ESPECIES_TITULO.map((x) => <option key={x}>{x}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="tit-emissao">Emissão</Label>
            <Input id="tit-emissao" type="date" value={f.emissao} onChange={(e) => setF({ ...f, emissao: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="tit-prescricao">Prescrição</Label>
            <Input id="tit-prescricao" type="date" value={f.prescricao} onChange={(e) => setF({ ...f, prescricao: e.target.value })} />
          </div>
        </div>
        <p className="text-meta text-lapis">A data de prescrição é a que o advogado conferiu. Sem ela, o motor trata a prescrição como alerta, nunca como certeza.</p>
        <div>
          <Label htmlFor="tit-obs">Observação <span className="font-500 text-lapis">(fica só aqui, não vai para a IA)</span></Label>
          <Textarea id="tit-obs" rows={2} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} />
        </div>
        {aviso && <p role="status" className={cn("rounded-controle px-3 py-2 text-sm2", aviso.tipo === "ok" ? "bg-pago-fundo text-pago" : "bg-margem-fundo text-margem")}>{aviso.msg}</p>}
        {podeEditar && <Button variant="outline" className="w-full" onClick={salvar} disabled={gravando || !mudou}>{gravando ? "Salvando…" : "Salvar dados do título"}</Button>}
      </fieldset>
    </section>
  );
}
