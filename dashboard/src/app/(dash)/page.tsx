import Link from "next/link";
import { redirect } from "next/navigation";
import { ListChecks, UserPlus, FileUp, Download } from "lucide-react";
import { supabaseServer } from "@/lib/supabase-server";
import { getSessao } from "@/lib/auth";
import { RESULTADOS, type Resultado } from "@/lib/resultados";
import { brl, cn, contar, num, porcento } from "@/lib/utils";
import { diaISO, instanteSP, margem, partesSP, porExtenso } from "@/lib/datas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel" };

type Funil = { carteira_id: number; nome: string; base: number; saldo_total: number; saldo_aberto: number; contatados: number; responderam: number; negociando: number; acordo_ou_promessa: number; pagos: number };

// O Painel do MC COB ("Visão executiva da recuperação"), com os mesmos blocos que o Maurelio usa:
// números do dia, carteira por credor, funil de cobrança, ações rápidas e últimas ocorrências. Cada
// número leva para a tela onde ele se resolve.
export default async function Painel() {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  const sb = await supabaseServer();
  const p = partesSP();
  const inicioMes = instanteSP(p.ano, p.mes, 1).toISOString();
  const agora = new Date().toISOString();
  const ha30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [{ data: funil }, { data: recMes }, { data: recTudo }, { data: ativos }, vencida, quebrados, { data: ocorrencias }, semDono] = await Promise.all([
    sb.from("v_funil_carteira").select("*").order("nome"),
    sb.from("v_recebimentos").select("valor").gte("recebido_em", inicioMes).limit(20000),
    sb.from("v_recebimentos").select("carteira_id, valor").limit(50000),
    sb.from("acordos").select("id, acordo_parcelas(status, valor)").eq("status", "ativo").limit(2000),
    sb.from("agenda").select("id", { count: "exact", head: true }).eq("status", "pendente").lt("quando", agora),
    sb.from("acordos").select("id", { count: "exact", head: true }).eq("status", "quebrado").gte("encerrado_em", ha30),
    sb.from("ocorrencias").select("id, resultado, autor_nome, criado_em, devedor_id, devedores(nome)").order("criado_em", { ascending: false }).limit(8),
    sb.from("devedores").select("id", { count: "exact", head: true }).is("responsavel_id", null).neq("status_cobranca", "pago"),
  ]);

  const carteiras = (funil ?? []) as Funil[];
  const soma = (k: keyof Funil) => carteiras.reduce((s, c) => s + Number(c[k] ?? 0), 0);
  const emAberto = soma("saldo_aberto");
  const base = soma("base");
  const recuperadoMes = (recMes ?? []).reduce((s, r) => s + Number(r.valor), 0);
  const recuperado = new Map<number, number>();
  for (const r of recTudo ?? []) if (r.carteira_id) recuperado.set(r.carteira_id, (recuperado.get(r.carteira_id) ?? 0) + Number(r.valor));
  const aReceber = (ativos ?? []).reduce((s, a) => s + (a.acordo_parcelas as { status: string; valor: number }[]).filter((x) => x.status === "aberta").reduce((t, x) => t + Number(x.valor), 0), 0);
  const primeiroNome = (sessao.nome ?? "").trim().split(/\s+/)[0] || "";

  const kpis = [
    { rotulo: "Carteira em aberto", valor: brl(emAberto), nota: contar(base, "devedor", "devedores"), href: "/devedores" },
    { rotulo: "Recuperado no mês", valor: brl(recuperadoMes), nota: "Pix e parcelas pagas", href: "/financeiro", cor: "text-pago" },
    { rotulo: "Em negociação", valor: num(soma("negociando")), nota: "com conversa ou acordo", href: "/devedores?situacao=em_negociacao" },
    { rotulo: "Acordos ativos", valor: num((ativos ?? []).length), nota: `${brl(aReceber)} a receber`, href: "/acordos" },
    { rotulo: "Agenda vencida", valor: num(vencida.count ?? 0), nota: "promessas e retornos atrasados", href: "/agenda", cor: (vencida.count ?? 0) > 0 ? "text-margem" : undefined },
    { rotulo: "Acordos quebrados", valor: num(quebrados.count ?? 0), nota: "nos últimos 30 dias", href: "/acordos?aba=quebrados", cor: (quebrados.count ?? 0) > 0 ? "text-margem" : undefined },
  ];
  const etapas: { k: keyof Funil; t: string }[] = [
    { k: "base", t: "Base" }, { k: "contatados", t: "Com contato" }, { k: "responderam", t: "Responderam" },
    { k: "negociando", t: "Em negociação" }, { k: "acordo_ou_promessa", t: "Acordo ou promessa" }, { k: "pagos", t: "Pagos" },
  ];
  // Ações, não atalhos do menu: cada uma faz uma coisa do dia
  const nSemDono = semDono.count ?? 0;
  const acoes = [
    { href: "/trabalho-hoje", t: "Começar o trabalho de hoje", s: "Quem chamar agora, na ordem certa", icon: ListChecks },
    { href: "/devedores?aba=sem", t: "Distribuir devedores", s: nSemDono ? `${contar(nSemDono, "devedor sem responsável", "devedores sem responsável")}` : "Todos já têm responsável", icon: UserPlus },
    { href: "/carteiras/nova", t: "Importar planilha", s: "Uma carteira nova a partir do Excel", icon: FileUp },
    { href: `/api/financeiro/exportar?de=${diaISO(new Date(inicioMes))}&ate=${diaISO()}`, t: "Baixar recebimentos do mês", s: "Planilha para conferir e repassar", icon: Download, baixar: true },
  ];

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-pagina font-600 text-ouro">{primeiroNome ? `Olá, ${primeiroNome}` : "Painel"}</h1>
          <p className="mt-1 text-[0.9375rem] text-lapis">{porExtenso()} · visão executiva da recuperação</p>
        </div>
        {/* O lema do MC COB, como no painel que o Maurelio desenhou */}
        <p className="border-l-2 border-tinta pl-4 font-display text-[0.8125rem] font-500 uppercase leading-relaxed tracking-[0.16em] text-ouro">
          Disciplina em cada processo.<br />Resultado em cada negociação.
        </p>
      </header>

      {/* Os números do dia, cada um leva para onde ele se resolve */}
      <dl className="mt-6 grid grid-cols-2 overflow-hidden rounded-painel border border-pauta bg-folha sm:grid-cols-3 min-[1300px]:grid-cols-6">
        {kpis.map((k) => (
          <Link key={k.rotulo} href={k.href} className="linha-hover min-w-0 px-4 py-3.5 shadow-[1px_0_0_0_rgb(var(--c-line)),0_1px_0_0_rgb(var(--c-line))]">
            <dt className="text-meta font-600 text-lapis">{k.rotulo}</dt>
            <dd className={cn("mt-1 font-mono text-[1.125rem] font-600 leading-tight tabnums", k.cor ?? "text-ouro")}>{k.valor}</dd>
            <dd className="mt-0.5 text-meta text-lapis">{k.nota}</dd>
          </Link>
        ))}
      </dl>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section aria-labelledby="t-carteiras" className="rounded-painel border border-pauta bg-folha">
          <h2 id="t-carteiras" className="flex items-baseline justify-between gap-3 border-b border-pauta px-5 py-3.5 font-display text-titulo font-600 text-ouro">
            Carteira por credor
            <Link href="/carteiras" className="alvo-toque font-sans text-sm2 font-600 text-tinta hover:underline">Ver carteiras</Link>
          </h2>
          {carteiras.length === 0 ? (
            <p className="px-5 py-6 text-[0.9375rem] text-lapis">Nenhuma carteira ainda. Importe a primeira planilha em Credores / Carteiras.</p>
          ) : (
            <ul role="list">
              {carteiras.map((c) => {
                const rec = recuperado.get(c.carteira_id) ?? 0;
                const pagos = c.base ? (Number(c.pagos) / Number(c.base)) * 100 : 0;
                return (
                  <li key={c.carteira_id} className="border-b border-pauta px-5 py-3.5 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <Link href={`/carteiras/${c.carteira_id}`} className="alvo-toque min-w-0 font-700 text-texto hover:text-tinta hover:underline">{c.nome}</Link>
                      <span className="font-mono text-[0.9375rem] tabnums text-texto">{brl(Number(c.saldo_aberto))} <span className="font-sans text-meta text-lapis">em aberto</span></span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 text-sm2 text-lapis">
                      <span>{contar(Number(c.base), "devedor", "devedores")} · {contar(Number(c.pagos), "pago", "pagos")}</span>
                      <span><span className="font-mono tabnums text-pago">{brl(rec)}</span> recuperado</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-pauta" aria-hidden="true">
                      <div className="h-full rounded-full bg-pago" style={{ width: `${Math.min(100, pagos)}%` }} />
                    </div>
                  </li>
                );
              })}
              {carteiras.length > 1 && (
                <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-papel/60 px-5 py-3">
                  <span className="font-700 text-texto">Total</span>
                  <span className="text-sm2 text-lapis">
                    <span className="font-mono text-[0.9375rem] tabnums text-texto">{brl(emAberto)}</span> em aberto ·{" "}
                    <span className="font-mono tabnums text-pago">{brl([...recuperado.values()].reduce((s, v) => s + v, 0))}</span> recuperado
                  </span>
                </li>
              )}
            </ul>
          )}
        </section>

        <section aria-labelledby="t-funil" className="rounded-painel border border-pauta bg-folha">
          <h2 id="t-funil" className="flex items-baseline justify-between gap-3 border-b border-pauta px-5 py-3.5 font-display text-titulo font-600 text-ouro">
            Funil de cobrança
            <Link href="/relatorios" className="alvo-toque font-sans text-sm2 font-600 text-tinta hover:underline">Relatórios & BI</Link>
          </h2>
          <ul role="list" className="px-5 py-2">
            {etapas.map((e) => {
              const n = soma(e.k);
              const pct = base ? (n / base) * 100 : 0;
              return (
                <li key={e.k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-pauta py-2.5 last:border-b-0">
                  <span className="flex items-center gap-2.5 text-[0.9375rem] text-texto">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", e.k === "pagos" ? "bg-pago" : "bg-tinta")} aria-hidden="true" />
                    {e.t}
                  </span>
                  <span className="font-mono text-[0.9375rem] tabnums text-texto">
                    {num(n)} <span className="text-meta text-lapis">{e.k === "base" ? "" : porcento(Math.round(pct * 10) / 10)}</span>
                  </span>
                  <span className="col-span-2 mt-1.5 h-1 overflow-hidden rounded-full bg-pauta" aria-hidden="true">
                    <span className={cn("block h-full rounded-full", e.k === "pagos" ? "bg-pago" : "bg-tinta")} style={{ width: `${Math.max(e.k === "base" ? 100 : 0, Math.min(100, pct))}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section aria-labelledby="t-acoes">
          <h2 id="t-acoes" className="font-display text-titulo font-600 text-ouro">Ações rápidas</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {acoes.map((a) => {
              const Icon = a.icon;
              const classe = "group flex min-h-[5.25rem] items-start gap-3 rounded-painel border border-pauta-forte bg-folha p-4 transition-[border-color,background-color,transform] duration-150 ease-saida hover:border-tinta/70 hover:bg-tinta-clara active:scale-[0.98]";
              const corpo = (
                <>
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-tinta" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-700 text-texto group-hover:text-ouro">{a.t}</span>
                    <span className="mt-0.5 block text-sm2 text-lapis">{a.s}</span>
                  </span>
                </>
              );
              // O arquivo do mês é download: link comum, para o navegador baixar em vez de navegar
              return a.baixar
                ? <a key={a.t} href={a.href} download className={classe}>{corpo}</a>
                : <Link key={a.t} href={a.href} className={classe}>{corpo}</Link>;
            })}
          </div>
        </section>

        <section aria-labelledby="t-ocorrencias">
          <h2 id="t-ocorrencias" className="font-display text-titulo font-600 text-ouro">Últimas ocorrências</h2>
          {(ocorrencias ?? []).length === 0 ? (
            <p className="mt-3 text-[0.9375rem] text-lapis">Nenhuma ocorrência registrada até o momento.</p>
          ) : (
            <ul role="list" className="pagina-pautada mt-3 rounded-painel border border-pauta bg-folha [--margem:76px]">
              {(ocorrencias ?? []).map((o) => {
                const r = RESULTADOS[o.resultado as Resultado];
                const nome = (o.devedores as unknown as { nome: string } | null)?.nome ?? "Devedor";
                return (
                  <li key={o.id} className="grid grid-cols-[var(--margem)_minmax(0,1fr)] border-b border-pauta last:border-b-0">
                    <span className="px-3 py-2.5 font-mono text-sm2 tabnums text-tinta">{margem(o.criado_em)}</span>
                    <span className="min-w-0 px-4 py-2.5">
                      <Link href={`/devedores/${o.devedor_id}`} className="alvo-toque font-600 text-texto hover:text-tinta hover:underline">{nome}</Link>
                      <span className={cn("block text-sm2", r?.tom === "bom" ? "text-pago" : r?.tom === "ruim" ? "text-margem" : "text-lapis")}>
                        {r?.rotulo ?? o.resultado}{o.autor_nome ? <span className="text-lapis"> · {o.autor_nome.split(" ")[0]}</span> : null}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
