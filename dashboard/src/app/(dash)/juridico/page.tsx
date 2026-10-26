import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getSessao } from "@/lib/auth";
import { podeJuridico } from "@/lib/juridico/acesso";
import { FONTES_OFICIAIS, VERSAO_MOTOR } from "@/lib/juridico/fontes";
import type { Analise, Caso } from "@/lib/juridico/tipos";
import { CasosLista } from "@/components/juridico/casos";
import { brl, cn, contar, num } from "@/lib/utils";
import { dataLonga, diaISO, hora } from "@/lib/datas";
import { AnalisarUm, AnalisesLista, LoteAnalise, PrecedenteForm, SincronizarFontes } from "./_juridico/acoes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jurídico" };

const ABAS = [
  { k: "triagem", t: "Triagem" },
  { k: "analises", t: "Análises" },
  { k: "processos", t: "Processos" },
  { k: "fontes", t: "Fontes oficiais" },
  { k: "precedentes", t: "Precedentes" },
] as const;
type Aba = (typeof ABAS)[number]["k"];

// O Jurídico Automático da V5.6.00–02: fato → prova → lei oficial do dia → prescrição → medida →
// tese e antítese → estratégia → minuta → aprovação do advogado. Nada vira protocolo sozinho.
export default async function Juridico({ searchParams }: { searchParams: Promise<{ aba?: string; carteira?: string }> }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (sessao.role === "credor") redirect("/");
  const f = await searchParams;
  const aba: Aba = ABAS.some((a) => a.k === f.aba) ? (f.aba as Aba) : "triagem";
  const carteira = Number(f.carteira) || null;
  const decide = podeJuridico(sessao.role);
  const sb = await supabaseServer();

  const naTriagem = () => {
    let q = sb.from("devedores").select("id", { count: "exact", head: true }).gt("saldo", 0).neq("status_cobranca", "pago").is("inativo_em", null);
    if (carteira) q = q.eq("carteira_id", carteira);
    return q;
  };
  const [{ data: carteiras }, triagemTotal, analisesRasc, analisesAprov, casosAbertos, { data: fontesRows }, precedentesTotal] = await Promise.all([
    sb.from("carteiras").select("id, nome").order("nome"),
    naTriagem(),
    sb.from("juridico_analises").select("id", { count: "exact", head: true }).eq("status", "RASCUNHO"),
    sb.from("juridico_analises").select("id", { count: "exact", head: true }).eq("status", "APROVADA"),
    sb.from("juridico_casos").select("id", { count: "exact", head: true }).neq("status", "Encerrado"),
    sb.from("juridico_fontes").select("*"),
    sb.from("juridico_precedentes").select("id", { count: "exact", head: true }).eq("ativo", true),
  ]);
  const nomesCarteira = new Map((carteiras ?? []).map((c) => [c.id as number, c.nome as string]));
  const porChave = new Map((fontesRows ?? []).map((r) => [r.chave as string, r]));
  const fontes = FONTES_OFICIAIS.map((fo) => ({ ...fo, linha: porChave.get(fo.chave) ?? null }));
  const hoje = diaISO();
  const confirmadasHoje = fontes.filter((x) => x.linha?.ok_em && diaISO(new Date(x.linha.ok_em)) === hoje && ["OK", "ALTERAÇÃO DETECTADA"].includes(x.linha.status)).length;
  const alteradas = fontes.filter((x) => x.linha?.alterada).length;

  const kpis = [
    { rotulo: "Na triagem", valor: num(triagemTotal.count ?? 0), nota: "com saldo em aberto", href: "/juridico" },
    { rotulo: "Análises", valor: num((analisesRasc.count ?? 0) + (analisesAprov.count ?? 0)), nota: contar(analisesAprov.count ?? 0, "aprovada", "aprovadas"), href: "/juridico?aba=analises" },
    { rotulo: "Casos abertos", valor: num(casosAbertos.count ?? 0), nota: "no fluxo formal", href: "/juridico?aba=processos" },
    { rotulo: "Fontes do dia", valor: `${confirmadasHoje} de ${fontes.length}`, nota: alteradas ? `${alteradas} com alteração a revisar` : "confirmadas hoje", href: "/juridico?aba=fontes", cor: alteradas ? "text-margem" : confirmadasHoje < fontes.filter((x) => x.tipo === "LEGISLACAO").length ? "text-atencao" : undefined },
    { rotulo: "Precedentes", valor: num(precedentesTotal.count ?? 0), nota: "com link oficial", href: "/juridico?aba=precedentes" },
  ];
  const href = (k: Aba) => `/juridico${k === "triagem" ? (carteira ? `?carteira=${carteira}` : "") : `?aba=${k}`}`;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-pagina font-600 text-ouro">Jurídico</h1>
          <p className="mt-1 max-w-[70ch] text-[0.9375rem] text-lapis">Triagem, lei oficial do dia, estratégia e minuta. Quem aprova é o advogado; nada é protocolado sozinho. Motor {VERSAO_MOTOR}.</p>
        </div>
        {decide && <SincronizarFontes />}
      </header>

      <dl className="mt-6 grid grid-cols-2 overflow-hidden rounded-painel border border-pauta bg-folha sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <Link key={k.rotulo} href={k.href} className="linha-hover min-w-0 px-4 py-3.5 shadow-[1px_0_0_0_rgb(var(--c-line)),0_1px_0_0_rgb(var(--c-line))]">
            <dt className="text-meta font-600 text-lapis">{k.rotulo}</dt>
            <dd className={cn("mt-1 font-mono text-[1.125rem] font-600 leading-tight tabnums", k.cor ?? "text-ouro")}>{k.valor}</dd>
            <dd className="mt-0.5 text-meta text-lapis">{k.nota}</dd>
          </Link>
        ))}
      </dl>

      <nav aria-label="Seções do Jurídico" className="mt-6 flex gap-1 sem-barra overflow-x-auto overflow-y-hidden border-b border-pauta">
        {ABAS.map((a) => (
          <Link key={a.k} href={href(a.k)} aria-current={aba === a.k ? "page" : undefined}
            className={cn("relative flex h-11 shrink-0 items-center px-3 text-[0.9375rem] font-600", aba === a.k ? "text-tinta" : "text-lapis hover:text-texto")}>
            {a.t}
            {aba === a.k && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-tinta" />}
          </Link>
        ))}
      </nav>

      <div className="pt-6">
        {aba === "triagem" && await Triagem({ sb, carteira, carteiras: carteiras ?? [], decide, nomesCarteira })}
        {aba === "analises" && await Analises({ sb, decide })}
        {aba === "processos" && await Processos({ sb, decide })}
        {aba === "fontes" && <Fontes fontes={fontes} decide={decide} />}
        {aba === "precedentes" && await Precedentes({ sb, decide })}
      </div>
    </div>
  );
}

type SB = Awaited<ReturnType<typeof supabaseServer>>;

async function Triagem({ sb, carteira, carteiras, decide, nomesCarteira }: { sb: SB; carteira: number | null; carteiras: { id: number; nome: string }[]; decide: boolean; nomesCarteira: Map<number, string> }) {
  // Quem tem saldo, do maior para o menor (como na V5); vencimento mais antigo desempata
  let q = sb.from("devedores").select("id, nome, processo, saldo, vencimento, carteira_id, titulo_especie, prescricao_em")
    .gt("saldo", 0).neq("status_cobranca", "pago").is("inativo_em", null)
    .order("saldo", { ascending: false }).order("vencimento", { ascending: true, nullsFirst: false }).limit(200);
  if (carteira) q = q.eq("carteira_id", carteira);
  const { data: devs } = await q;
  const ids = (devs ?? []).map((d) => d.id);
  const ultima = new Map<number, { medida: string; confianca: number; status: string; criado_em: string }>();
  if (ids.length) {
    const { data } = await sb.from("juridico_analises").select("devedor_id, medida, confianca, status, criado_em").in("devedor_id", ids).order("criado_em", { ascending: false });
    for (const a of data ?? []) if (!ultima.has(a.devedor_id)) ultima.set(a.devedor_id, a);
  }
  const candidatos = (devs ?? []).map((d) => ({ id: d.id, nome: d.nome, analisado: ultima.has(d.id) }));

  return (
    <section aria-labelledby="t-triagem">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="t-triagem" className="font-display text-titulo font-600 text-ouro">Triagem para cobrança judicial</h2>
          <p className="mt-1 max-w-[65ch] text-[0.9375rem] text-lapis">Valor e vencimento vêm da carteira; espécie, prescrição conferida e documentos, da ficha de cada um. Mostrando os 200 maiores saldos.</p>
        </div>
        <form action="/juridico" className="flex items-end gap-2">
          <label className="text-sm2 font-600">
            <span className="mb-1.5 block">Carteira</span>
            <select name="carteira" defaultValue={carteira ?? ""} className="h-10 rounded-controle border border-pauta-forte bg-folha px-2.5 text-[0.9375rem] outline-none focus:border-tinta [@media(pointer:coarse)]:h-11">
              <option value="">Todas</option>
              {carteiras.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <button type="submit" className="h-10 rounded-botao border border-pauta-forte bg-folha px-4 text-[0.9375rem] font-600 text-tinta hover:bg-tinta-clara [@media(pointer:coarse)]:h-11">Filtrar</button>
        </form>
      </div>
      {decide && candidatos.length > 0 && <LoteAnalise candidatos={candidatos} />}
      {candidatos.length === 0 ? (
        <p className="mt-4 text-[0.9375rem] text-lapis">Ninguém com saldo em aberto {carteira ? "nesta carteira" : "agora"}.</p>
      ) : (
        <ul className="pagina-pautada mt-4 border-y border-pauta bg-folha [--margem:88px] sm:[--margem:104px]">
          {(devs ?? []).map((d) => {
            const a = ultima.get(d.id);
            return (
              <li key={d.id} className="grid grid-cols-[var(--margem)_minmax(0,1fr)] border-b border-pauta last:border-b-0 sm:grid-cols-[var(--margem)_minmax(0,1fr)_auto_auto] sm:items-center">
                <span className="px-3 py-3 font-mono text-sm2 text-tinta tabnums sm:px-4" title="Vencimento">{d.vencimento ? dataLonga(d.vencimento).slice(3) : "—"}</span>
                <span className="min-w-0 py-2.5 pl-3 pr-3 sm:pl-4">
                  <Link href={`/devedores/${d.id}?aba=juridico`} className="alvo-toque font-700 text-texto hover:text-tinta hover:underline [overflow-wrap:anywhere]">{d.nome}</Link>
                  <span className="block text-sm2 text-lapis">
                    {nomesCarteira.get(d.carteira_id) ?? ""}{d.processo ? <> · <span className="whitespace-nowrap font-mono">{d.processo}</span></> : ""}{d.titulo_especie ? ` · ${d.titulo_especie}` : ""}
                    {d.prescricao_em ? ` · prescrição ${dataLonga(d.prescricao_em)}` : ""}
                  </span>
                  <span className="block text-sm2">
                    {a ? <><span className="font-600 text-texto">{a.medida}</span> <span className="text-lapis">· {a.confianca}% · {a.status === "APROVADA" ? <span className="font-600 text-pago">aprovada</span> : "rascunho"} · {dataLonga(a.criado_em)}</span></> : <span className="text-lapis">Ainda não analisado</span>}
                  </span>
                </span>
                <span className="col-start-2 px-3 pb-3 font-mono text-[0.9375rem] tabnums sm:col-start-auto sm:px-4 sm:pb-0 sm:text-right">{brl(Number(d.saldo))}</span>
                {decide && <span className="col-start-2 px-3 pb-3 sm:col-start-auto sm:py-2.5 sm:pl-0 sm:pr-4"><AnalisarUm devedorId={d.id} analisado={!!a} /></span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

async function Analises({ sb, decide }: { sb: SB; decide: boolean }) {
  const [{ data }, { data: casos }] = await Promise.all([
    sb.from("juridico_analises").select("*, devedores(nome)").order("criado_em", { ascending: false }).limit(50),
    sb.from("juridico_casos").select("analise_id").not("analise_id", "is", null),
  ]);
  const linhas = (data ?? []).map((a) => ({ ...(a as unknown as Analise), nome: (a.devedores as unknown as { nome: string } | null)?.nome ?? "Devedor" }));
  return (
    <section aria-labelledby="t-analises">
      <h2 id="t-analises" className="font-display text-titulo font-600 text-ouro">Análises recentes</h2>
      <p className="mt-1 max-w-[65ch] text-[0.9375rem] text-lapis">Cada análise guarda o que o motor leu, a versão dele e o estado das fontes oficiais naquele dia.</p>
      <AnalisesLista analises={linhas} podeDecidir={decide} comCaso={(casos ?? []).map((c) => c.analise_id as number)} />
    </section>
  );
}

async function Processos({ sb, decide }: { sb: SB; decide: boolean }) {
  const { data } = await sb.from("juridico_casos").select("*, devedores(nome)").order("status").order("prazo", { ascending: true, nullsFirst: false }).limit(300);
  const casos = (data ?? []) as unknown as (Caso & { devedores: { nome: string } | null })[];
  const nomes = new Map(casos.map((c) => [c.devedor_id, c.devedores?.nome ?? "Devedor"]));
  return (
    <section aria-labelledby="t-processos">
      <h2 id="t-processos" className="font-display text-titulo font-600 text-ouro">Processos</h2>
      <p className="mt-1 max-w-[65ch] text-[0.9375rem] text-lapis">O andamento formal depois da decisão do advogado. O prazo fica na margem e fica vermelho quando passa.</p>
      <CasosLista casos={casos} podeDecidir={decide} devedores={nomes} />
    </section>
  );
}

type FonteTela = (typeof FONTES_OFICIAIS)[number] & { linha: Record<string, any> | null };

function Fontes({ fontes, decide }: { fontes: FonteTela[]; decide: boolean }) {
  const hoje = diaISO();
  const grupos: { t: string; tipo: string; nota: string }[] = [
    { t: "Legislação", tipo: "LEGISLACAO", nota: "Texto compilado do Planalto. A cada leitura o sistema compara artigo por artigo; mudança real fica marcada para revisão." },
    { t: "Jurisprudência", tipo: "JURISPRUDENCIA", nota: "Portais dos tribunais. Alguns recusam leitura automática; aí a pesquisa de cada caso é feita direto no domínio oficial." },
  ];
  return (
    <div className="space-y-8">
      {grupos.map((g) => (
        <section key={g.tipo} aria-labelledby={`t-${g.tipo}`}>
          <h2 id={`t-${g.tipo}`} className="font-display text-titulo font-600 text-ouro">{g.t}</h2>
          <p className="mt-1 max-w-[70ch] text-[0.9375rem] text-lapis">{g.nota}</p>
          <ul className="mt-3 divide-y divide-pauta border-y border-pauta bg-folha">
            {fontes.filter((x) => x.tipo === g.tipo).map((x) => {
              const l = x.linha;
              const doDia = !!l?.ok_em && diaISO(new Date(l.ok_em)) === hoje;
              const status: string = l?.status ?? "NUNCA_VERIFICADA";
              const texto = status === "OK" ? (doDia ? "Confirmada hoje" : "Confirmada antes de hoje") : status === "ALTERAÇÃO DETECTADA" ? "Mudou: revisar" : status === "CONSULTA VIA PESQUISA" ? "Consulta pela pesquisa do caso" : status === "INDISPONÍVEL" ? "Não respondeu" : "Nunca verificada";
              const tom = status === "ALTERAÇÃO DETECTADA" || status === "INDISPONÍVEL" ? "text-margem" : status === "OK" && doDia ? "text-pago" : status === "CONSULTA VIA PESQUISA" ? "text-lapis" : "text-atencao";
              return (
                <li key={x.chave} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <span className="min-w-0">
                    <a href={x.url} target="_blank" rel="noopener" className="alvo-toque font-600 text-texto hover:text-tinta hover:underline">{x.nome}</a>
                    {x.critica && <span className="text-sm2 text-lapis"> · essencial</span>}
                    {l?.alterada && (l.artigos_alterados?.length ?? 0) > 0 && <span className="block text-sm2 font-600 text-margem">Artigos ou blocos alterados: {(l.artigos_alterados as string[]).slice(0, 30).join(", ")}</span>}
                    {status === "INDISPONÍVEL" && l?.erro && <span className="block truncate text-sm2 text-lapis" title={l.erro}>{l.erro}</span>}
                  </span>
                  <span className="text-sm2 sm:text-right">
                    <span className={cn("font-600", tom)}>{texto}</span>
                    {l?.ok_em && <span className="block font-mono text-lapis">{dataLonga(l.ok_em)} {hora(l.ok_em)}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!decide && <p className="text-sm2 text-lapis">Só o administrador e o dono da operação sincronizam as fontes.</p>}
    </div>
  );
}

async function Precedentes({ sb, decide }: { sb: SB; decide: boolean }) {
  const { data } = await sb.from("juridico_precedentes").select("*").eq("ativo", true).order("publicado_em", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(100);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-labelledby="t-precedentes">
        <h2 id="t-precedentes" className="font-display text-titulo font-600 text-ouro">Banco de precedentes</h2>
        <p className="mt-1 max-w-[65ch] text-[0.9375rem] text-lapis">O motor nunca inventa jurisprudência: usa só as decisões daqui, todas com link oficial conferido, e a pesquisa nos sites dos tribunais.</p>
        {(data ?? []).length === 0 ? (
          <p className="mt-3 text-[0.9375rem] text-lapis">Nenhuma decisão cadastrada ainda.</p>
        ) : (
          <ul className="mt-3 divide-y divide-pauta border-y border-pauta bg-folha">
            {(data ?? []).map((p) => (
              <li key={p.id} className="px-4 py-3">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <a href={p.url_oficial} target="_blank" rel="noopener" className="alvo-toque font-700 text-texto hover:text-tinta hover:underline">{p.tribunal}{p.processo ? ` · ${p.processo}` : ""}</a>
                  <span className="text-sm2 text-lapis">{p.nivel === "A" ? "vinculante ou qualificado" : p.nivel === "B" ? "tribunal competente" : "persuasivo"}{p.publicado_em ? ` · publicado em ${dataLonga(p.publicado_em)}` : ""}</span>
                </p>
                {p.tema && <p className="text-sm2 font-600 text-texto">{p.tema}</p>}
                <p className="mt-0.5 max-w-[75ch] text-[0.9375rem]">{p.tese}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {decide && <PrecedenteForm />}
    </div>
  );
}
