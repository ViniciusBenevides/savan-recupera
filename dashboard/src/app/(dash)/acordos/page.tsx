import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getSessao } from "@/lib/auth";
import { SectionTitle, Select, Button } from "@/components/ui/primitives";
import { Carne } from "@/components/ficha/carne";
import { brl, cn, contar, porcento } from "@/lib/utils";
import { dataCurta, diaISO, inicioDoDiaSP, partesSP, instanteSP, prazo, deDiaISO } from "@/lib/datas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acordos" };

const ABAS = [
  { k: "ativos", t: "Ativos" },
  { k: "atraso", t: "Com atraso" },
  { k: "quitados", t: "Quitados" },
  { k: "quebrados", t: "Quebrados" },
  { k: "todos", t: "Todos" },
];
const STATUS: Record<string, { t: string; cor: string }> = {
  ativo: { t: "Ativo", cor: "text-texto" }, quitado: { t: "Quitado", cor: "text-pago" }, quebrado: { t: "Quebrado", cor: "text-margem" }, cancelado: { t: "Cancelado", cor: "text-lapis" },
};

type Parc = { id: number; numero: number; vencimento: string; valor: number; status: string; valor_pago: number | null };
type Linha = { id: number; devedor_id: number; valor_divida: number; desconto_pct: number; valor_total: number; parcelas: number; status: string; criado_por_nome: string | null; criado_em: string; quitado_em: string | null; devedores: { nome: string; carteiras: { nome: string } | null } | null; acordo_parcelas: Parc[] };

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string; carteira?: string; q?: string }> }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  const f = await searchParams;
  const aba = ABAS.some((a) => a.k === f.aba) ? f.aba! : "ativos";
  const sb = await supabaseServer();
  const hoje = diaISO();

  let q = sb.from("acordos")
    .select("id, devedor_id, valor_divida, desconto_pct, valor_total, parcelas, status, criado_por_nome, criado_em, quitado_em, carteira_id, devedores!inner(nome, carteiras(nome)), acordo_parcelas(id, numero, vencimento, valor, status, valor_pago)")
    .order("criado_em", { ascending: false }).limit(500);
  if (aba === "ativos" || aba === "atraso") q = q.eq("status", "ativo");
  if (aba === "quitados") q = q.eq("status", "quitado");
  if (aba === "quebrados") q = q.in("status", ["quebrado", "cancelado"]);
  if (f.carteira) q = q.eq("carteira_id", Number(f.carteira));
  if (f.q) q = q.ilike("devedores.nome", `%${f.q.replace(/[%,()]/g, " ").trim()}%`);

  const [{ data, error }, { data: carteiras }, { data: todosAtivos }] = await Promise.all([
    q,
    sb.from("carteiras").select("id, nome").order("nome"),
    sb.from("acordos").select("id, status, valor_total, quitado_em, acordo_parcelas(status, vencimento, valor, valor_pago)").in("status", ["ativo", "quitado"]).limit(2000),
  ]);

  let linhas = (data ?? []) as unknown as Linha[];
  const temAtraso = (l: { acordo_parcelas: { status: string; vencimento: string }[] }) => l.acordo_parcelas.some((p) => p.status === "aberta" && p.vencimento < hoje);
  if (aba === "atraso") linhas = linhas.filter(temAtraso);

  // Resumo em uma linha (sem cartões): ativos, a receber, com atraso, quitados no mês
  const p = partesSP();
  const inicioMes = instanteSP(p.ano, p.mes, 1).toISOString();
  const ativos = (todosAtivos ?? []).filter((a) => a.status === "ativo");
  const aReceber = ativos.reduce((s, a) => s + (a.acordo_parcelas as { status: string; valor: number }[]).filter((x) => x.status === "aberta").reduce((t, x) => t + Number(x.valor), 0), 0);
  const comAtraso = ativos.filter((a) => temAtraso(a as unknown as { acordo_parcelas: { status: string; vencimento: string }[] })).length;
  const quitadosMes = (todosAtivos ?? []).filter((a) => a.status === "quitado" && a.quitado_em && a.quitado_em >= inicioMes).length;

  const totalLista = linhas.reduce((s, l) => s + Number(l.valor_total), 0);
  const recebidoLista = linhas.reduce((s, l) => s + l.acordo_parcelas.filter((x) => x.status === "paga").reduce((t, x) => t + Number(x.valor_pago ?? x.valor), 0), 0);
  const hrefAba = (k: string) => { const u = new URLSearchParams(); if (k !== "ativos") u.set("aba", k); if (f.carteira) u.set("carteira", f.carteira); if (f.q) u.set("q", f.q); const s = u.toString(); return `/acordos${s ? `?${s}` : ""}`; };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <SectionTitle
        title="Acordos"
        sub={<>{contar(ativos.length, "ativo", "ativos")} · {brl(aReceber)} a receber · <span className={comAtraso ? "font-600 text-margem" : ""}>{comAtraso} com parcela atrasada</span> · {contar(quitadosMes, "quitado", "quitados")} este mês</>}
      />
      <div className="flex gap-1 sem-barra overflow-x-auto overflow-y-hidden border-b border-pauta" role="tablist">
        {ABAS.map((a) => (
          <Link key={a.k} href={hrefAba(a.k)} role="tab" aria-selected={aba === a.k} className={cn("relative flex h-11 shrink-0 items-center px-3 text-[0.9375rem] font-600", aba === a.k ? "text-tinta" : "text-lapis hover:text-texto")}>
            {a.t}
            {aba === a.k && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-tinta" />}
          </Link>
        ))}
      </div>
      <form action="/acordos" className="mt-4 flex flex-wrap gap-2">
        {aba !== "ativos" && <input type="hidden" name="aba" value={aba} />}
        <input name="q" defaultValue={f.q ?? ""} placeholder="Nome do devedor" aria-label="Buscar por nome" className="h-10 w-full min-w-0 rounded-controle border border-pauta-forte bg-folha px-3 text-[0.9375rem] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:text-base outline-none focus:border-tinta focus:ring-2 focus:ring-tinta/15 sm:w-auto sm:max-w-[320px] sm:flex-1" />
        <Select name="carteira" defaultValue={f.carteira ?? ""} className="min-w-0 flex-1 sm:w-auto sm:flex-none" aria-label="Carteira">
          <option value="">Todas as carteiras</option>
          {(carteiras ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>

      {error && <p role="alert" className="mt-4 rounded-controle bg-margem-fundo px-3 py-2 text-sm2 text-margem">Não foi possível carregar os acordos.</p>}

      {linhas.length === 0 ? (
        <div className="mt-6 rounded-painel border border-pauta bg-folha px-5 py-6">
          <p className="font-display text-titulo font-600 text-ouro">{aba === "atraso" ? "Nenhum acordo com atraso" : "Nenhum acordo aqui"}</p>
          <p className="mt-1 text-[0.9375rem] text-lapis">Acordos nascem na ficha do devedor, em <span className="font-600">Fazer acordo</span>, dentro dos limites da carteira.</p>
        </div>
      ) : (
        <>
          <ul className="pagina-pautada mt-5 border-y border-pauta bg-folha [--margem:92px]" role="list">
            {linhas.map((l) => {
              const parcelas = [...l.acordo_parcelas].sort((a, b) => a.numero - b.numero);
              const proxima = parcelas.find((x) => x.status === "aberta");
              const atrasada = proxima && proxima.vencimento < hoje;
              const st = STATUS[l.status] ?? STATUS.ativo;
              return (
                <li key={l.id} className="grid grid-cols-[var(--margem)_minmax(0,1fr)] border-b border-pauta last:border-b-0 lg:grid-cols-[var(--margem)_minmax(0,1fr)_minmax(0,320px)_auto]">
                  <span className={cn("px-4 py-3 font-mono text-sm2 tabnums", atrasada ? "text-margem" : "text-tinta")}>
                    {proxima ? dataCurta(proxima.vencimento) : l.quitado_em ? dataCurta(l.quitado_em) : dataCurta(l.criado_em)}
                  </span>
                  <div className="min-w-0 px-4 py-2.5">
                    <Link href={`/devedores/${l.devedor_id}?aba=acordo`} className="alvo-toque font-700 text-texto hover:text-tinta hover:underline">{l.devedores?.nome}</Link>
                    <span className="ml-2 text-meta text-lapis">{l.devedores?.carteiras?.nome}</span>
                    <p className="text-sm2 text-lapis">
                      <span className={cn("font-600", st.cor)}>{st.t}</span>{" · "}
                      {proxima ? (atrasada ? <span className="font-600 text-margem">parcela atrasada {prazo(deDiaISO(proxima.vencimento))}</span> : `próxima ${prazo(deDiaISO(proxima.vencimento))}`) : l.status === "quitado" ? "tudo pago" : ""}
                      {` · ${porcento(Number(l.desconto_pct))} de desconto · ${l.criado_por_nome ?? "—"}`}
                    </p>
                    <p className="mt-0.5 font-mono text-[0.9375rem] tabnums text-texto lg:hidden">{brl(l.valor_total)}</p>
                  </div>
                  <div className="col-start-2 min-w-0 px-4 pb-3 lg:col-start-auto lg:py-3">
                    <Carne parcelas={parcelas} total={l.parcelas} compacto />
                  </div>
                  <span className="hidden px-4 py-3 text-right font-mono tabnums lg:block">{brl(l.valor_total)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-right text-[0.9375rem]">
            {contar(linhas.length, "acordo", "acordos")}: <span className="font-mono tabnums">{brl(totalLista)}</span> acordados e <span className="font-mono tabnums text-pago">{brl(recebidoLista)}</span> recebidos
          </p>
        </>
      )}
    </div>
  );
}
