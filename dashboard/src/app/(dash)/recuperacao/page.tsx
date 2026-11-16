import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { getSessao } from "@/lib/auth";
import { Button, Select, SectionTitle } from "@/components/ui/primitives";
import { quandoPromessa, semContatoUtil } from "@/lib/recuperacao";
import { TrocaDados } from "@/components/dev/TrocaDados";
import { casoDeTeste, vistaRecuperacao } from "@/lib/dev/pior-caso";
import type { Frente, MotivoAtencao, PessoaAtencao, TomAtencao, VistaRecuperacao } from "@/lib/vistas";
import { brl, cn, contar, num, porcento } from "@/lib/utils";
import { fimDoDiaSP, ha, inicioDoDiaSP, margem, somarDias } from "@/lib/datas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Central de recuperação" };

type Tom = TomAtencao;
type Motivo = MotivoAtencao;
type Pessoa = PessoaAtencao;

const COR: Record<Tom, string> = { atraso: "text-margem", atencao: "text-atencao", neutro: "text-texto" };
const PERIODOS = [7, 30, 90];
const RESPONDEU = ["falou_com_titular", "promessa", "acordo", "pagou", "ja_pagou", "pediu_retorno", "recusou", "contestou"];

// O PostgREST devolve até 1.000 linhas por pedido: quem precisa contar gente busca página a página.
async function todas<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: unknown }>, teto = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < teto; de += 1000) {
    const { data } = await pagina(de, de + 999);
    const linhas = (data ?? []) as T[];
    out.push(...linhas);
    if (linhas.length < 1000) break;
  }
  return out;
}

/**
 * Central de recuperação (MC COB V5.7.16): o que precisa de uma pessoa agora, as promessas de
 * pagamento e o que cada carteira rendeu no período. Tudo sai do que a equipe e o robô já
 * registraram; cada número leva para a tela onde ele se resolve.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ carteira?: string; periodo?: string; dados?: string }> }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (sessao.role === "credor") redirect("/relatorios");
  const f = await searchParams;
  const periodo = PERIODOS.includes(Number(f.periodo)) ? Number(f.periodo) : 30;
  const sb = await supabaseServer();

  const { data: funilRaw, error: erroBase } = await sb.from("v_funil_carteira").select("carteira_id, nome, base, pagos, saldo_aberto").order("nome");
  const carteiras = (funilRaw ?? []) as { carteira_id: number; nome: string; base: number; pagos: number; saldo_aberto: number }[];
  const carteiraId = carteiras.some((c) => c.carteira_id === Number(f.carteira)) ? Number(f.carteira) : null;
  const escolhidas = carteiraId ? carteiras.filter((c) => c.carteira_id === carteiraId) : carteiras;
  const idsVisiveis = escolhidas.map((c) => c.carteira_id);
  const nomeCarteira = new Map(carteiras.map((c) => [c.carteira_id, c.nome]));
  // (o tipo do construtor de consulta é fundo demais para um genérico com restrição: entra e sai igual)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const naCarteira = <Q,>(q: Q): Q => (carteiraId ? (q as any).eq("carteira_id", carteiraId) : q);

  const agora = new Date();
  const hojeIni = inicioDoDiaSP(agora).toISOString();
  const desde = inicioDoDiaSP(somarDias(agora, -periodo)).toISOString();
  const ha2h = new Date(agora.getTime() - 2 * 3_600_000).toISOString();
  const ha10d = new Date(agora.getTime() - 10 * 86_400_000).toISOString();
  const ha30d = new Date(agora.getTime() - 30 * 86_400_000).toISOString();
  const adm = supabaseAdmin();

  const [agendaAberta, cumpridas, quebradas, esperando, contestados, pix, jaPagou, falhas, resumos,
    acionados, respostasOc, respostasMsg, promessasNovas, acordosNovos, recebidos] = await Promise.all([
    naCarteira(sb.from("agenda").select("id, devedor_id, carteira_id, tipo, quando, valor, observacao").eq("status", "pendente"))
      .lte("quando", fimDoDiaSP(somarDias(agora, 120)).toISOString()).order("quando").limit(1000),
    naCarteira(sb.from("agenda").select("id", { count: "exact", head: true }).eq("tipo", "promessa").eq("status", "cumprida")).gte("concluido_em", desde),
    naCarteira(sb.from("agenda").select("id", { count: "exact", head: true }).eq("tipo", "promessa").eq("status", "quebrada")).gte("concluido_em", desde),
    naCarteira(sb.from("v_conversas_esperando").select("id, devedor_id, carteira_id, ultima_msg_em", { count: "exact" })).order("ultima_msg_em").limit(60),
    naCarteira(sb.from("devedores").select("id, ultimo_contato_em", { count: "exact" }).eq("status_cobranca", "contestado").is("inativo_em", null))
      .order("ultimo_contato_em", { ascending: false, nullsFirst: false }).limit(40),
    (carteiraId
      ? sb.from("pagamentos").select("id, devedor_id, valor, criado_em, devedores!inner(carteira_id)", { count: "exact" }).eq("devedores.carteira_id", carteiraId)
      : sb.from("pagamentos").select("id, devedor_id, valor, criado_em", { count: "exact" })
    ).eq("status", "pendente").eq("simulacao", false).lt("criado_em", ha2h).gt("criado_em", ha10d).order("criado_em").limit(60),
    naCarteira(sb.from("ocorrencias").select("devedor_id, carteira_id, criado_em").eq("resultado", "ja_pagou")).gte("criado_em", ha30d).order("criado_em", { ascending: false }).limit(200),
    naCarteira(sb.from("fila_envios").select("id", { count: "exact", head: true }).eq("status", "falha")),
    // Quem não dá para chamar por falta de contato vem da mesma regra da fila da carteira
    Promise.all(idsVisiveis.map((id) => adm.rpc("fn_fila_carteira_resumo", { p_carteira_id: id }))),
    todas<{ id: number; carteira_id: number }>((a, b) => naCarteira(sb.from("devedores").select("id, carteira_id").gte("ultimo_contato_em", desde).is("inativo_em", null)).order("id").range(a, b)),
    todas<{ devedor_id: number; carteira_id: number | null }>((a, b) => naCarteira(sb.from("ocorrencias").select("devedor_id, carteira_id").gte("criado_em", desde).in("resultado", RESPONDEU)).order("id").range(a, b)),
    todas<{ conversas: { devedor_id: number; carteira_id: number | null } }>((a, b) => (carteiraId
      ? sb.from("mensagens").select("id, conversas!inner(devedor_id, carteira_id)").eq("conversas.carteira_id", carteiraId)
      : sb.from("mensagens").select("id, conversas!inner(devedor_id, carteira_id)")
    ).eq("direcao", "entrada").gte("criado_em", desde).order("id").range(a, b)),
    todas<{ devedor_id: number; carteira_id: number | null }>((a, b) => naCarteira(sb.from("agenda").select("devedor_id, carteira_id").eq("tipo", "promessa").gte("criado_em", desde)).order("id").range(a, b)),
    todas<{ devedor_id: number; carteira_id: number | null; valor_total: number }>((a, b) => naCarteira(sb.from("acordos").select("devedor_id, carteira_id, valor_total").gte("criado_em", desde)).order("id").range(a, b)),
    todas<{ devedor_id: number; carteira_id: number | null; valor: number }>((a, b) => naCarteira(sb.from("v_recebimentos").select("devedor_id, carteira_id, valor").gte("recebido_em", desde)).order("recebido_em").range(a, b)),
  ]);

  // ---------- Promessas e retornos ----------
  type Ag = { id: number; devedor_id: number; carteira_id: number | null; tipo: string; quando: string; valor: number | null; observacao: string | null };
  const agenda = (agendaAberta.data ?? []) as Ag[];
  const promessas = agenda.filter((a) => a.tipo === "promessa");
  const nPromessa = { vencida: 0, hoje: 0, amanha: 0, futura: 0 };
  for (const p of promessas) nPromessa[quandoPromessa(p.quando, agora)]++;
  const promessasVencidas = promessas.filter((p) => quandoPromessa(p.quando, agora) === "vencida");
  const retornosVencidos = agenda.filter((a) => a.tipo === "retorno" && a.quando < hojeIni);

  // ---------- Quem precisa de você: uma linha por pessoa, com todos os motivos ----------
  type Esp = { id: number; devedor_id: number; ultima_msg_em: string };
  type Pg = { id: number; devedor_id: number; valor: number; criado_em: string };
  const esperandoLista = (esperando.data ?? []) as Esp[];
  const pixLista = (pix.data ?? []) as unknown as Pg[];
  const contestadosLista = (contestados.data ?? []) as { id: number; ultimo_contato_em: string | null }[];
  const dissePago = new Map<number, string>();
  for (const o of (jaPagou.data ?? []) as { devedor_id: number; criado_em: string }[]) if (!dissePago.has(o.devedor_id)) dissePago.set(o.devedor_id, o.criado_em);

  const ids = new Set<number>([
    ...esperandoLista.map((x) => x.devedor_id), ...promessasVencidas.map((x) => x.devedor_id), ...retornosVencidos.map((x) => x.devedor_id),
    ...pixLista.map((x) => x.devedor_id), ...contestadosLista.map((x) => x.id), ...dissePago.keys(),
  ]);
  type Dev = { id: number; nome: string; saldo: number; carteira_id: number; status_cobranca: string; inativo_em: string | null };
  const devs = new Map<number, Dev>();
  const listaIds = [...ids];
  for (let i = 0; i < listaIds.length; i += 200) {
    const { data } = await sb.from("devedores").select("id, nome, saldo, carteira_id, status_cobranca, inativo_em").in("id", listaIds.slice(i, i + 200));
    for (const d of (data ?? []) as Dev[]) devs.set(d.id, d);
  }
  // "Disse que já pagou" só pede conferência enquanto a dívida segue aberta
  const paraConferir = [...dissePago].filter(([id]) => { const d = devs.get(id); return !!d && d.status_cobranca !== "pago" && !d.inativo_em; });

  const pessoas = new Map<number, Pessoa>();
  const juntar = (devedorId: number, m: Motivo, conversa: number | null = null) => {
    const d = devs.get(devedorId);
    if (!d || d.inativo_em) return;
    const p = pessoas.get(devedorId) ?? { id: d.id, nome: d.nome, carteira: nomeCarteira.get(d.carteira_id) ?? "", saldo: Number(d.saldo), motivos: [], conversa: null };
    if (!p.motivos.some((x) => x.rotulo === m.rotulo)) p.motivos.push(m);
    if (conversa) p.conversa = conversa;
    pessoas.set(devedorId, p);
  };
  for (const c of esperandoLista) juntar(c.devedor_id, { rotulo: `Respondeu ${ha(c.ultima_msg_em, agora)} e espera`, tom: "atraso", passo: "Responder", quando: c.ultima_msg_em, peso: 0 }, c.id);
  for (const p of promessasVencidas) juntar(p.devedor_id, { rotulo: `Promessa${p.valor ? ` de ${brl(Number(p.valor))}` : ""} venceu ${margem(p.quando, agora) === "ontem" ? "ontem" : `em ${margem(p.quando, agora)}`}`, tom: "atraso", passo: "Conferir o pagamento", quando: p.quando, peso: 1 });
  for (const [id, quando] of paraConferir) juntar(id, { rotulo: `Disse que já pagou ${ha(quando, agora)}`, tom: "atencao", passo: "Pedir o comprovante", quando, peso: 2 });
  for (const p of pixLista) juntar(p.devedor_id, { rotulo: `Pediu o Pix de ${brl(Number(p.valor))} ${ha(p.criado_em, agora)} e não pagou`, tom: "atencao", passo: "Chamar de novo", quando: p.criado_em, peso: 3 });
  for (const r of retornosVencidos) juntar(r.devedor_id, { rotulo: `Retorno de ${margem(r.quando, agora)} ficou para trás`, tom: "atraso", passo: "Retornar", quando: r.quando, peso: 4 });
  for (const c of contestadosLista) juntar(c.id, { rotulo: "Contestou a dívida", tom: "atencao", passo: "Conferir antes de cobrar", quando: c.ultimo_contato_em ?? "", peso: 5 });
  const fila = [...pessoas.values()]
    .map((p) => ({ ...p, motivos: p.motivos.sort((a, b) => a.peso - b.peso) }))
    .sort((a, b) => a.motivos[0].peso - b.motivos[0].peso || a.motivos[0].quando.localeCompare(b.motivos[0].quando));
  const LIMITE = 30;

  // ---------- As frentes de atenção ----------
  const semContato = (resumos as { data: { motivos?: Record<string, number> } | null }[]).reduce((s, r) => s + semContatoUtil(r.data?.motivos), 0);
  const linkCarteira = carteiraId ? `/carteiras/${carteiraId}` : "/carteiras";
  const filtroCarteira = carteiraId ? `&carteira=${carteiraId}` : "";
  const frentes: Frente[] = [
    { t: "Responderam e esperam você", s: "O devedor escreveu por último e ninguém respondeu.", n: esperando.count ?? esperandoLista.length, tom: "atraso", href: "/trabalho-hoje", acao: "Responder" },
    { t: "Promessas vencidas", s: "O dia combinado passou sem pagamento registrado.", n: nPromessa.vencida, tom: "atraso", href: "/agenda?tipo=promessas&quem=equipe", acao: "Conferir" },
    { t: "Pagamentos para conferir", s: "Disse que já pagou nos últimos 30 dias e a dívida segue aberta.", n: paraConferir.length, tom: "atencao", href: "#quem", acao: "Ver quem" },
    { t: "Pix pedido e não pago", s: "Recebeu o Pix há mais de duas horas e ainda não pagou.", n: pix.count ?? pixLista.length, tom: "atencao", href: "/trabalho-hoje", acao: "Chamar de novo" },
    { t: "Retornos vencidos", s: "Contato marcado que ficou para trás.", n: retornosVencidos.length, tom: "atraso", href: "/agenda?tipo=retornos&quem=equipe", acao: "Retornar" },
    { t: "Contestações para conferir", s: "Contestou a dívida: confira antes de voltar a cobrar.", n: contestados.count ?? contestadosLista.length, tom: "atencao", href: `/devedores?situacao=contestado${filtroCarteira}`, acao: "Conferir" },
    { t: "Envios do robô com falha", s: "Abordagens que não saíram e ficaram paradas na fila.", n: falhas.count ?? 0, tom: "atraso", href: "/disparos", acao: "Ver disparos" },
    { t: "Sem telefone que dê para chamar", s: "Sem telefone, só fixo ou nenhum celular com WhatsApp.", n: semContato, tom: "neutro", href: linkCarteira, acao: "Higienizar" },
  ];

  // ---------- Funil do período, por carteira ----------
  type Linha = { acionados: Set<number>; responderam: Set<number>; promessas: Set<number>; acordos: number; valorAcordos: number; pagaram: Set<number>; recuperado: number };
  const vazia = (): Linha => ({ acionados: new Set(), responderam: new Set(), promessas: new Set(), acordos: 0, valorAcordos: 0, pagaram: new Set(), recuperado: 0 });
  const porCarteira = new Map<number, Linha>(idsVisiveis.map((id) => [id, vazia()]));
  const linha = (id: number | null) => (id != null ? porCarteira.get(id) : undefined);
  for (const d of acionados) linha(d.carteira_id)?.acionados.add(d.id);
  for (const o of respostasOc) linha(o.carteira_id)?.responderam.add(o.devedor_id);
  for (const m of respostasMsg) linha(m.conversas?.carteira_id ?? null)?.responderam.add(m.conversas.devedor_id);
  for (const p of promessasNovas) linha(p.carteira_id)?.promessas.add(p.devedor_id);
  for (const a of acordosNovos) { const l = linha(a.carteira_id); if (l) { l.acordos++; l.valorAcordos += Number(a.valor_total); } }
  for (const r of recebidos) { const l = linha(r.carteira_id); if (l) { l.pagaram.add(r.devedor_id); l.recuperado += Number(r.valor); } }
  const tabela = escolhidas.map((c) => {
    const l = porCarteira.get(c.carteira_id) ?? vazia();
    // quem respondeu sem ter saído abordagem no período (escreveu por conta própria) também foi acionado
    const acionadosN = new Set([...l.acionados, ...l.responderam]).size;
    return {
      id: c.carteira_id, nome: c.nome, emAberto: Math.max(0, Number(c.base) - Number(c.pagos)), saldoAberto: Number(c.saldo_aberto),
      acionados: acionadosN, responderam: l.responderam.size, promessas: l.promessas.size, acordos: l.acordos, valorAcordos: l.valorAcordos,
      pagaram: l.pagaram.size, recuperado: l.recuperado,
    };
  });
  // O que a tela desenha. No ambiente de desenvolvimento, ?dados=pior|vazio|um troca pelo pior caso.
  const real: VistaRecuperacao = {
    frentes, fila, tabela,
    promessas: { ...nPromessa, cumpridas: cumpridas.count ?? 0, quebradas: quebradas.count ?? 0 },
  };
  const caso = casoDeTeste(f.dados);
  const v = caso ? vistaRecuperacao(caso) : real;
  const urgentes = v.frentes.filter((x) => x.tom === "atraso" && x.n > 0).length;
  const deAtencao = v.frentes.filter((x) => x.tom === "atencao" && x.n > 0).length;
  const emDia = v.frentes.filter((x) => x.n === 0).length;
  const soma = <K extends keyof (typeof v.tabela)[number]>(k: K) => v.tabela.reduce((s, l) => s + Number(l[k]), 0);
  const total = {
    emAberto: soma("emAberto"), saldoAberto: soma("saldoAberto"), acionados: soma("acionados"), responderam: soma("responderam"), promessas: soma("promessas"),
    acordos: soma("acordos"), valorAcordos: soma("valorAcordos"), pagaram: soma("pagaram"), recuperado: soma("recuperado"),
  };
  const taxa = (parte: number, todo: number) => {
    if (!todo) return "";
    const p = Math.round((parte / todo) * 1000) / 10;
    return parte > 0 && p === 0 ? "<0,1%" : porcento(p);
  };

  const kpisPromessa = [
    { rotulo: "Vencidas", n: v.promessas.vencida, cor: v.promessas.vencida ? "text-margem" : "text-ouro", nota: "passaram do dia" },
    { rotulo: "Hoje", n: v.promessas.hoje, cor: "text-ouro", nota: "para conferir até o fim do dia" },
    { rotulo: "Amanhã", n: v.promessas.amanha, cor: "text-ouro", nota: "vale lembrar hoje" },
    { rotulo: "Mais para frente", n: v.promessas.futura, cor: "text-ouro", nota: "voltam para a fila no dia" },
    { rotulo: "Cumpridas", n: v.promessas.cumpridas, cor: v.promessas.cumpridas ? "text-pago" : "text-ouro", nota: `nos últimos ${periodo} dias` },
    { rotulo: "Não cumpridas", n: v.promessas.quebradas, cor: v.promessas.quebradas ? "text-margem" : "text-ouro", nota: `nos últimos ${periodo} dias` },
  ];

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <SectionTitle
        title="Central de recuperação"
        sub="O que precisa de uma pessoa agora, as promessas de pagamento e o que cada carteira rendeu."
      />

      <form action="/recuperacao" className="grid gap-2 sm:grid-cols-[minmax(0,22rem)_minmax(0,14rem)_auto] sm:items-end sm:justify-start">
        <label className="block min-w-0 text-sm2 font-600 text-texto">
          Carteira
          <Select name="carteira" defaultValue={carteiraId ?? ""} className="mt-1">
            <option value="">Todas as carteiras</option>
            {carteiras.map((c) => <option key={c.carteira_id} value={c.carteira_id}>{c.nome}</option>)}
          </Select>
        </label>
        <label className="block min-w-0 text-sm2 font-600 text-texto">
          Período do funil
          <Select name="periodo" defaultValue={periodo} className="mt-1">
            {PERIODOS.map((p) => <option key={p} value={p}>Últimos {p} dias</option>)}
          </Select>
        </label>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      {erroBase && <p role="alert" className="mt-4 rounded-controle bg-margem-fundo px-3 py-2 text-sm2 text-margem">Não foi possível carregar as carteiras. Atualize a página; se continuar, avise o administrador.</p>}

      {/* ---------- Precisa da sua atenção ---------- */}
      <section aria-labelledby="t-atencao" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="t-atencao" className="font-display text-titulo font-600 text-ouro">Precisa da sua atenção</h2>
          <p className="text-sm2 text-lapis">
            {urgentes + deAtencao === 0 ? "Tudo em dia agora." : (
              <>
                {urgentes > 0 && <span className="font-600 text-margem">{contar(urgentes, "frente atrasada", "frentes atrasadas")}</span>}
                {urgentes > 0 && deAtencao > 0 && " · "}
                {deAtencao > 0 && <span className="font-600 text-atencao">{contar(deAtencao, "pede atenção", "pedem atenção")}</span>}
                {` · ${emDia} de ${v.frentes.length} em dia`}
              </>
            )}
          </p>
        </div>
        <ul role="list" className="mt-3 grid overflow-hidden rounded-painel border border-pauta bg-folha lg:grid-cols-2">
          {v.frentes.map((x, i) => (
            <li key={x.t} className={cn("pagina-pautada grid grid-cols-[var(--margem)_minmax(0,1fr)] items-center border-b border-pauta [--margem:76px] sm:grid-cols-[var(--margem)_minmax(0,1fr)_auto] sm:[--margem:92px]",
              i === v.frentes.length - 1 && "border-b-0", i === v.frentes.length - 2 && "lg:border-b-0", i % 2 === 0 && "lg:border-r")}>
              <span className={cn("row-span-2 whitespace-nowrap px-2 py-3 text-right font-mono text-corpo font-600 tabnums sm:row-span-1 sm:text-[1.125rem]", x.n > 0 ? COR[x.tom] : "text-lapis")}>{num(x.n)}</span>
              <span className={cn("min-w-0 px-4 pt-3 sm:pb-3", x.n > 0 ? "pb-2" : "pb-3")}>
                <span className={cn("block font-700", x.n > 0 ? "text-texto" : "text-lapis")}>{x.t}</span>
                <span className="block text-sm2 text-lapis">{x.n > 0 ? x.s : "Em dia."}</span>
              </span>
              {x.n > 0 && (
                <Link href={x.href} className="alvo-toque col-start-2 mb-3 ml-4 inline-flex h-8 w-fit items-center rounded-controle border border-pauta-forte px-3 text-sm2 font-600 text-tinta transition-colors duration-150 hover:bg-tinta-clara sm:col-start-3 sm:mb-0 sm:ml-0 sm:mr-4">
                  {x.acao}
                </Link>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-meta text-lapis">Em dia quer dizer que não há pendência aberta naquela frente agora. Não quer dizer que a dívida foi paga.</p>
      </section>

      {/* ---------- Quem precisa de você ---------- */}
      <section aria-labelledby="t-quem" id="quem" className="mt-8 scroll-mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="t-quem" className="font-display text-titulo font-600 text-ouro">Quem precisa de você</h2>
          <Link href="/trabalho-hoje" className="alvo-toque text-sm2 font-600 text-tinta hover:underline">Abrir o Trabalho de hoje</Link>
        </div>
        {v.fila.length === 0 ? (
          <div className="mt-3 rounded-painel border border-pauta bg-folha px-5 py-6">
            <p className="font-display text-titulo font-600 text-ouro">Ninguém esperando por você</p>
            <p className="mt-1 max-w-[60ch] text-[0.9375rem] text-lapis">Aparece aqui quem respondeu e ficou sem resposta, quem prometeu e não pagou, quem pediu o Pix e sumiu e quem contestou a dívida.</p>
          </div>
        ) : (
          <>
            <ul role="list" className="mt-3 border-y border-pauta bg-folha">
              {v.fila.slice(0, LIMITE).map((p) => (
                <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-b border-pauta px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_10rem_12.5rem] sm:items-center sm:px-5">
                  <span className="min-w-0">
                    <Link href={`/devedores/${p.id}`} className="alvo-toque block truncate font-700 text-texto hover:text-tinta hover:underline" title={p.nome}>{p.nome}</Link>
                    <span className="block truncate text-meta text-lapis" title={p.carteira}>{p.carteira}</span>
                  </span>
                  <span className="order-3 col-span-2 min-w-0 text-sm2 sm:order-none sm:col-span-1">
                    {p.motivos.map((m, i) => (
                      <span key={m.rotulo} className={cn(COR[m.tom], "font-600")}>{i > 0 && <span className="font-normal text-lapis"> · </span>}{m.rotulo}</span>
                    ))}
                  </span>
                  <span className="whitespace-nowrap text-right font-mono text-[0.9375rem] tabnums text-texto">{brl(p.saldo)}</span>
                  <Link
                    href={p.motivos[0].peso === 0 && p.conversa ? `/conversas?c=${p.conversa}` : `/devedores/${p.id}`}
                    className="alvo-toque order-4 col-span-2 inline-flex h-8 w-fit items-center rounded-controle border border-pauta-forte px-3 text-sm2 font-600 text-tinta transition-colors duration-150 hover:bg-tinta-clara sm:order-none sm:col-span-1 sm:justify-self-end"
                  >
                    {p.motivos[0].passo}
                  </Link>
                </li>
              ))}
            </ul>
            {v.fila.length > LIMITE && (
              <p className="mt-2 text-sm2 text-lapis">Mostrando {LIMITE} de {num(v.fila.length)}. O <Link href="/trabalho-hoje" className="font-600 text-tinta underline">Trabalho de hoje</Link> traz todos, na ordem de chamar.</p>
            )}
          </>
        )}
      </section>

      {/* ---------- Promessas de pagamento ---------- */}
      <section aria-labelledby="t-promessas" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="t-promessas" className="font-display text-titulo font-600 text-ouro">Promessas de pagamento</h2>
          <Link href="/agenda?tipo=promessas&quem=equipe" className="alvo-toque text-sm2 font-600 text-tinta hover:underline">Abrir a agenda de promessas</Link>
        </div>
        <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-painel border border-pauta bg-folha sm:grid-cols-3 min-[1100px]:grid-cols-6">
          {kpisPromessa.map((k) => (
            <div key={k.rotulo} className="min-w-0 px-4 py-3.5 shadow-[1px_0_0_0_rgb(var(--c-line)),0_1px_0_0_rgb(var(--c-line))]">
              <dt className="text-meta font-600 text-lapis">{k.rotulo}</dt>
              <dd className={cn("mt-1 font-mono text-[1.125rem] font-600 leading-tight tabnums", k.cor)}>{num(k.n)}</dd>
              <dd className="mt-0.5 text-meta text-lapis">{k.nota}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 max-w-[75ch] text-meta text-lapis">Promessa vencida volta sozinha para o Trabalho de hoje. Marcar como cumprida não dá baixa na dívida: a baixa vem do pagamento registrado ou do Pix confirmado.</p>
      </section>

      {/* ---------- Funil do período ---------- */}
      <section aria-labelledby="t-funil" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="t-funil" className="font-display text-titulo font-600 text-ouro">Resultado dos últimos {periodo} dias</h2>
          <Link href="/relatorios" className="alvo-toque text-sm2 font-600 text-tinta hover:underline">Relatórios & BI</Link>
        </div>
        {v.tabela.length === 0 ? (
          <p className="mt-3 text-[0.9375rem] text-lapis">Nenhuma carteira ainda. Importe a primeira planilha em Credores / carteiras.</p>
        ) : (
          <>
            {/* Celular: uma carteira por bloco, com o recuperado à vista */}
            <ul role="list" className="mt-3 border-y border-pauta bg-folha md:hidden">
              {v.tabela.map((l) => (
                <li key={l.id} className="border-b border-pauta px-4 py-3 last:border-b-0">
                  <Link href={`/carteiras/${l.id}`} className="alvo-toque block truncate font-700 text-texto hover:text-tinta hover:underline" title={l.nome}>{l.nome}</Link>
                  <p className="font-mono text-meta tabnums text-lapis">{brl(l.saldoAberto)} em aberto · {contar(l.emAberto, "devedor", "devedores")}</p>
                  <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
                    {[["Acionados", num(l.acionados)], ["Responderam", num(l.responderam)], ["Promessas", num(l.promessas)], ["Acordos", num(l.acordos)], ["Pagaram", num(l.pagaram)]].map(([rotulo, valor]) => (
                      <div key={rotulo} className="min-w-0">
                        <dt className="truncate text-meta text-lapis">{rotulo}</dt>
                        <dd className="font-mono text-sm2 tabnums text-texto">{valor}</dd>
                      </div>
                    ))}
                    <div className="col-span-3 flex items-baseline justify-between gap-3 border-t border-pauta pt-2">
                      <dt className="text-sm2 text-lapis">Recuperado</dt>
                      <dd className={cn("font-mono text-[0.9375rem] font-600 tabnums", l.recuperado > 0 ? "text-pago" : "text-lapis")}>{brl(l.recuperado)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            <div className="mt-3 hidden overflow-x-auto rounded-painel border border-pauta bg-folha md:block">
              <table className="w-full text-[0.9375rem]">
                <thead>
                  <tr className="border-b border-pauta text-meta text-lapis">
                    <th scope="col" className="px-5 py-2.5 text-left font-600">Carteira</th>
                    {["Em aberto", "Acionados", "Responderam", "Promessas", "Acordos", "Pagaram", "Recuperado"].map((c) => (
                      <th key={c} scope="col" className="whitespace-nowrap px-3 py-2.5 text-right font-600 last:pr-5">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {v.tabela.map((l) => (
                    <tr key={l.id} className="border-b border-pauta last:border-b-0">
                      {/* a carteira fica com a largura que sobra e corta com reticências; número nunca corta */}
                      <th scope="row" className="w-full max-w-0 px-5 py-3 text-left font-600">
                        <Link href={`/carteiras/${l.id}`} className="alvo-toque block truncate text-texto hover:text-tinta hover:underline" title={l.nome}>{l.nome}</Link>
                        <span className="block truncate font-mono text-meta font-normal tabnums text-lapis">{brl(l.saldoAberto)} em aberto</span>
                      </th>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabnums">{num(l.emAberto)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabnums">{num(l.acionados)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabnums">{num(l.responderam)}{taxa(l.responderam, l.acionados) && <span className="block text-meta text-lapis">{taxa(l.responderam, l.acionados)}</span>}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabnums">{num(l.promessas)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabnums">{num(l.acordos)}{l.valorAcordos > 0 && <span className="block text-meta text-lapis">{brl(l.valorAcordos)}</span>}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabnums">{num(l.pagaram)}</td>
                      <td className={cn("whitespace-nowrap py-3 pl-3 pr-5 text-right font-mono tabnums", l.recuperado > 0 ? "text-pago" : "text-lapis")}>{brl(l.recuperado)}</td>
                    </tr>
                  ))}
                </tbody>
                {v.tabela.length > 1 && (
                  <tfoot>
                    <tr className="border-t border-pauta bg-papel/60 font-700">
                      <th scope="row" className="w-full max-w-0 px-5 py-3 text-left">Total<span className="block truncate font-mono text-meta font-normal tabnums text-lapis">{brl(total.saldoAberto)} em aberto</span></th>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabnums">{num(total.emAberto)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabnums">{num(total.acionados)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabnums">{num(total.responderam)}{taxa(total.responderam, total.acionados) && <span className="block text-meta font-normal text-lapis">{taxa(total.responderam, total.acionados)}</span>}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabnums">{num(total.promessas)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabnums">{num(total.acordos)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabnums">{num(total.pagaram)}</td>
                      <td className={cn("whitespace-nowrap py-3 pl-3 pr-5 text-right font-mono tabnums", total.recuperado > 0 ? "text-pago" : "text-lapis")}>{brl(total.recuperado)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
        <p className="mt-2 max-w-[75ch] text-meta text-lapis">Em aberto é quem ainda não pagou hoje; as outras colunas contam pessoas com movimento no período. O percentual ao lado de Responderam é sobre os acionados.</p>
      </section>
      <TrocaDados rota="/recuperacao" atual={caso} />
    </div>
  );
}
