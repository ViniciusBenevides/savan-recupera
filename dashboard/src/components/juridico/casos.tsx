"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { ETAPAS, PRIORIDADES, STATUS_CASO } from "@/lib/juridico/casos";
import type { Caso } from "@/lib/juridico/tipos";
import { brl, cn } from "@/lib/utils";
import { dataLonga, diaISO, prazo as prazoTexto } from "@/lib/datas";

type Campos = Record<string, string>;
const deCaso = (c?: Partial<Caso>): Campos => ({
  etapa: c?.etapa ?? "Pré-jurídico", prioridade: c?.prioridade ?? "Média", status: c?.status ?? "Aberto", acao: c?.acao ?? "Ação de cobrança",
  cnj: c?.cnj ?? "", tribunal: c?.tribunal ?? "", comarca: c?.comarca ?? "", vara: c?.vara ?? "",
  valor_causa: c?.valor_causa != null ? String(c.valor_causa).replace(".", ",") : "", custas: c?.custas != null ? String(c.custas).replace(".", ",") : "",
  responsavel: c?.responsavel ?? "", proxima_acao: c?.proxima_acao ?? "", prazo: c?.prazo ?? "", observacao: c?.observacao ?? "",
});

/** Formulário do caso, o mesmo para abrir e para atualizar o andamento. */
function FormCaso({ inicial, enviar, rotulo, onCancelar }: { inicial: Campos; enviar: (f: Campos) => Promise<string | null>; rotulo: string; onCancelar?: () => void }) {
  const [f, setF] = useState(inicial);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const id = (k: string) => `caso-${rotulo.length}-${k}`;

  async function salvar() {
    setGravando(true); setErro(null);
    const e = await enviar(f);
    setGravando(false);
    if (e) setErro(e);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Label htmlFor={id("acao")}>Tipo de ação</Label><Input id={id("acao")} value={f.acao} onChange={set("acao")} /></div>
      <div><Label htmlFor={id("etapa")}>Etapa</Label><Select id={id("etapa")} value={f.etapa} onChange={set("etapa")}>{ETAPAS.map((x) => <option key={x}>{x}</option>)}</Select></div>
      <div><Label htmlFor={id("status")}>Situação</Label><Select id={id("status")} value={f.status} onChange={set("status")}>{STATUS_CASO.map((x) => <option key={x}>{x}</option>)}</Select></div>
      <div><Label htmlFor={id("prio")}>Prioridade</Label><Select id={id("prio")} value={f.prioridade} onChange={set("prioridade")}>{PRIORIDADES.map((x) => <option key={x}>{x}</option>)}</Select></div>
      <div><Label htmlFor={id("prazo")}>Prazo</Label><Input id={id("prazo")} type="date" value={f.prazo} onChange={set("prazo")} /></div>
      <div className="sm:col-span-2"><Label htmlFor={id("prox")}>Próxima ação</Label><Input id={id("prox")} value={f.proxima_acao} onChange={set("proxima_acao")} placeholder="Ex.: protocolar no Projudi" /></div>
      <div className="sm:col-span-2"><Label htmlFor={id("cnj")}>Número CNJ</Label><Input id={id("cnj")} value={f.cnj} onChange={set("cnj")} inputMode="numeric" placeholder="0000000-00.0000.0.00.0000" className="font-mono" /></div>
      <div><Label htmlFor={id("comarca")}>Comarca</Label><Input id={id("comarca")} value={f.comarca} onChange={set("comarca")} /></div>
      <div><Label htmlFor={id("vara")}>Vara</Label><Input id={id("vara")} value={f.vara} onChange={set("vara")} /></div>
      <div><Label htmlFor={id("valor")}>Valor da causa (R$)</Label><Input id={id("valor")} inputMode="decimal" value={f.valor_causa} onChange={set("valor_causa")} className="font-mono" /></div>
      <div><Label htmlFor={id("custas")}>Custas (R$)</Label><Input id={id("custas")} inputMode="decimal" value={f.custas} onChange={set("custas")} className="font-mono" /></div>
      <div className="sm:col-span-2"><Label htmlFor={id("resp")}>Responsável</Label><Input id={id("resp")} value={f.responsavel} onChange={set("responsavel")} placeholder="Ex.: Dr. fulano, OAB/GO" /></div>
      <div className="sm:col-span-2"><Label htmlFor={id("obs")}>Notas</Label><Textarea id={id("obs")} rows={2} value={f.observacao} onChange={set("observacao")} /></div>
      {erro && <p role="alert" className="rounded-controle bg-margem-fundo px-3 py-2 text-sm2 text-margem sm:col-span-2">{erro}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button onClick={salvar} disabled={gravando || !f.acao.trim()}>{gravando ? "Salvando…" : rotulo}</Button>
        {onCancelar && <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>}
      </div>
    </div>
  );
}

/** Casos jurídicos (o processo formal depois da decisão do advogado), com o andamento editável. */
export function CasosLista({ casos, podeDecidir, devedores }: { casos: Caso[]; podeDecidir: boolean; devedores?: Map<number, string> }) {
  const router = useRouter();
  const [editando, setEditando] = useState<number | null>(null);
  const hoje = diaISO();
  if (!casos.length) return <p className="mt-2 text-[0.9375rem] text-lapis">Nenhum caso jurídico aberto.</p>;

  return (
    <ul className="pagina-pautada mt-2 border-y border-pauta bg-folha [--margem:84px] sm:[--margem:96px]">
      {casos.map((c) => {
        const vencido = !!c.prazo && c.prazo < hoje && !["Encerrado"].includes(c.status);
        return (
          <li key={c.id} className="border-b border-pauta last:border-b-0">
            <div className="grid grid-cols-[var(--margem)_minmax(0,1fr)] sm:grid-cols-[var(--margem)_minmax(0,1fr)_auto]">
              <span className={cn("px-3 py-3 font-mono text-sm2 tabnums sm:px-4", vencido ? "text-margem" : "text-tinta")} title={c.prazo ? `Prazo ${prazoTexto(c.prazo)}` : "Sem prazo"}>
                {c.prazo ? dataLonga(c.prazo).slice(0, 5) : "—"}
              </span>
              <span className="min-w-0 py-2.5 pl-3 pr-3 sm:pl-4">
                {devedores && <Link href={`/devedores/${c.devedor_id}?aba=juridico`} className="alvo-toque block font-700 text-texto hover:text-tinta hover:underline">{devedores.get(c.devedor_id) ?? "Devedor"}</Link>}
                <span className={cn("block", devedores ? "text-[0.9375rem]" : "font-700")}>{c.acao}</span>
                <span className="block text-sm2 text-lapis">
                  {c.etapa} · <span className={cn("font-600", c.status === "Encerrado" ? "text-lapis" : c.status === "Protocolado" ? "text-pago" : "text-texto")}>{c.status}</span>
                  {c.prioridade === "Alta" ? " · prioridade alta" : ""}{c.cnj ? <> · <span className="font-mono">{c.cnj}</span></> : ""}
                </span>
                {c.proxima_acao && <span className={cn("block text-sm2", vencido ? "font-600 text-margem" : "text-texto")}>{vencido ? "Atrasado: " : "Próximo: "}{c.proxima_acao}</span>}
              </span>
              <span className="col-span-2 col-start-2 flex items-center justify-between gap-3 pb-3 pl-3 pr-3 sm:col-span-1 sm:col-start-auto sm:flex-col sm:items-end sm:justify-center sm:py-2.5 sm:pl-0 sm:pr-4">
                <span className="font-mono text-[0.9375rem] tabnums">{c.valor_causa != null ? brl(Number(c.valor_causa)) : ""}</span>
                {podeDecidir && <Button size="sm" variant={editando === c.id ? "ghost" : "outline"} onClick={() => setEditando(editando === c.id ? null : c.id)}>{editando === c.id ? "Fechar" : "Atualizar"}</Button>}
              </span>
            </div>
            {editando === c.id && (
              <div className="mx-3 mb-3 rounded-controle bg-papel p-3 sm:ml-[calc(var(--margem)+16px)] sm:mr-4 animate-fade-up">
                <FormCaso inicial={deCaso(c)} rotulo="Salvar andamento" onCancelar={() => setEditando(null)} enviar={async (f) => {
                  const r = await fetch(`/api/juridico/casos/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
                  const j = await r.json().catch(() => ({}));
                  if (!r.ok) return j?.erro ?? "Não foi possível salvar.";
                  setEditando(null); router.refresh(); return null;
                }} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** "Novo caso jurídico" sem análise (o formulário da aba Jurídico da V5). */
export function NovoCaso({ devedorId, acao, valor }: { devedorId: number; acao: string; valor: number }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  return (
    <>
      {ok && <p role="status" className="mb-3 rounded-controle bg-pago-fundo px-3 py-2 text-sm2 text-pago">Caso aberto. Ele aparece na lista e na tela do Jurídico.</p>}
      <FormCaso inicial={deCaso({ acao, valor_causa: valor })} rotulo="Abrir caso" enviar={async (f) => {
        const r = await fetch("/api/juridico/casos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, devedor_id: devedorId }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return j?.erro ?? "Não foi possível abrir o caso.";
        setOk(true); router.refresh(); return null;
      }} />
    </>
  );
}
