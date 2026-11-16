import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Search, X } from "lucide-react";
import { supabaseServer } from "@/lib/supabase-server";
import { getSessao, podeEscrever } from "@/lib/auth";
import { Button, Select, SectionTitle, estiloBotao } from "@/components/ui/primitives";
import { mascararCPF } from "@/lib/documento";
import { COLUNAS_ATRASO, ORDENS_ATRASO, enderecoAtraso, filtrarAtraso, lerFiltros, ordenarAtraso, type FaixaOuTodas } from "@/lib/atraso";
import { FAIXAS, faixaDoVencimento, tempoEmAtraso, triagem } from "@/lib/recuperacao";
import { TrocaDados } from "@/components/dev/TrocaDados";
import { casoDeTeste, vistaAtraso } from "@/lib/dev/pior-caso";
import type { LinhaAtraso, VistaAtraso } from "@/lib/vistas";
import { brl, cn, num } from "@/lib/utils";
import { dataLonga } from "@/lib/datas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atraso / prescrição" };

const POR_PAGINA = 50;
const COR = { neutro: "text-lapis", atencao: "text-atencao", atraso: "text-margem" } as const;


/**
 * Atraso / prescrição (MC COB V5.7.03): os devedores com saldo por tempo de atraso, para achar
 * rápido o que está perto ou passou dos 5 anos. É triagem para a equipe e para o Jurídico; a tela
 * não muda nada e não declara ninguém prescrito.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ carteira?: string; q?: string; faixa?: string; ordem?: string; p?: string; dados?: string }> }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (sessao.role === "credor") redirect("/");
  const bruto = await searchParams;
  const f = lerFiltros(bruto);
  const pagina = Math.max(1, Number(bruto.p) || 1);
  const sb = await supabaseServer();
  const hoje = new Date();

  const contar = (faixa: FaixaOuTodas) => filtrarAtraso(sb.from("devedores").select("id", { count: "exact", head: true }), f, faixa, hoje);
  const ini = (pagina - 1) * POR_PAGINA;
  const [{ data: carteiras }, todas, porFaixa, lista] = await Promise.all([
    sb.from("carteiras").select("id, nome").order("nome"),
    contar("todas"),
    Promise.all(FAIXAS.map((x) => contar(x.k))),
    ordenarAtraso(filtrarAtraso(sb.from("devedores").select(COLUNAS_ATRASO, { count: "exact" }), f, f.faixa, hoje), f.ordem).range(ini, ini + POR_PAGINA - 1),
  ]);

  // O que a tela desenha. No ambiente de desenvolvimento, ?dados=pior|vazio|um troca pelo pior caso.
  const real: VistaAtraso = {
    contagens: { todas: todas.count ?? 0, ...Object.fromEntries(FAIXAS.map((x, i) => [x.k, porFaixa[i].count ?? 0])) },
    linhas: (lista.data ?? []) as unknown as LinhaAtraso[], total: lista.count ?? 0,
  };
  const caso = casoDeTeste(bruto.dados);
  const v = caso ? vistaAtraso(caso) : real;
  const { linhas, total } = v;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const saldoDaPagina = linhas.reduce((s, l) => s + Number(l.saldo), 0);
  const filtrosAtivos = [f.q, f.carteira, f.faixa !== "todas" ? f.faixa : ""].filter(Boolean).length;
  const celulas: { k: FaixaOuTodas; t: string; n: number; cor?: string }[] = [
    { k: "todas", t: "Todos", n: v.contagens.todas ?? 0 },
    ...FAIXAS.map((x) => ({
      k: x.k as FaixaOuTodas, t: x.curto, n: v.contagens[x.k] ?? 0,
      // cor só nas duas faixas que pedem alguma coisa: agir antes dos 5 anos e completar o vencimento
      cor: x.k === "4a5" || x.k === "sem" ? "text-atencao" : undefined,
    })),
  ];

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <SectionTitle
        title="Atraso / prescrição"
        sub="Devedores com saldo, separados por tempo de atraso desde o vencimento."
        action={podeEscrever(sessao.role) && total > 0 ? (
          <a href={enderecoAtraso(f, {}, "/api/atraso/exportar")} download className={estiloBotao("outline")}>
            <Download className="h-4 w-4" aria-hidden="true" /> Baixar planilha
          </a>
        ) : undefined}
      />

      <p className="max-w-[80ch] rounded-painel border border-pauta-forte bg-tinta-clara px-4 py-3 text-[0.9375rem] text-texto">
        <strong className="font-700">Isto é triagem, não é declaração de prescrição.</strong>{" "}
        Os 5 anos são a referência para achar créditos antigos. O prazo de verdade depende do tipo de título e pode ter sido suspenso ou
        interrompido: quem confere é o <Link href="/juridico" className="font-600 text-tinta underline">Jurídico</Link>, na ficha de cada devedor.
      </p>

      {/* As faixas: cada número é um filtro */}
      <nav aria-label="Faixas de atraso" className="mt-5 grid grid-cols-2 overflow-hidden rounded-painel border border-pauta bg-folha sm:grid-cols-4 xl:grid-cols-8">
        {celulas.map((c) => {
          const ativa = f.faixa === c.k;
          return (
            <Link key={c.k} href={enderecoAtraso(f, { faixa: c.k === "todas" ? "" : c.k })} aria-current={ativa ? "true" : undefined}
              className={cn("min-w-0 px-4 py-3 shadow-[1px_0_0_0_rgb(var(--c-line)),0_1px_0_0_rgb(var(--c-line))] transition-colors duration-150", ativa ? "bg-tinta-clara" : "linha-hover")}>
              <span className={cn("block truncate text-meta font-600", ativa ? "text-tinta" : "text-lapis")}>{c.t}</span>
              <span className={cn("mt-1 block font-mono text-[1.125rem] font-600 leading-tight tabnums", c.n > 0 ? c.cor ?? "text-ouro" : "text-lapis")}>{num(c.n)}</span>
            </Link>
          );
        })}
      </nav>

      <form action="/atraso" className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        {f.faixa !== "todas" && <input type="hidden" name="faixa" value={f.faixa} />}
        <label className="relative">
          <span className="sr-only">Buscar por nome, CPF ou processo</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lapis" aria-hidden="true" />
          <input name="q" defaultValue={f.q} placeholder="Nome, CPF ou processo" className="h-10 w-full rounded-controle border border-pauta-forte bg-folha pl-9 pr-3 text-[0.9375rem] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-lapis/70 focus:border-tinta focus:ring-2 focus:ring-tinta/15 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:text-base" />
        </label>
        <Select name="carteira" defaultValue={f.carteira ?? ""} aria-label="Carteira">
          <option value="">Todas as carteiras</option>
          {(carteiras ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        <Select name="ordem" defaultValue={f.ordem} aria-label="Ordem">
          {ORDENS_ATRASO.map((o) => <option key={o.k} value={o.k}>{o.t}</option>)}
        </Select>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      {filtrosAtivos > 0 && (
        <Link href="/atraso" className="mt-2 inline-flex h-9 items-center gap-1 text-sm2 font-600 text-tinta hover:underline">
          <X className="h-4 w-4" aria-hidden="true" /> Limpar {filtrosAtivos === 1 ? "filtro" : `${filtrosAtivos} filtros`}
        </Link>
      )}

      {lista.error && <p role="alert" className="mt-4 rounded-controle bg-margem-fundo px-3 py-2 text-sm2 text-margem">Não foi possível carregar a lista. Atualize a página e tente de novo.</p>}

      {linhas.length === 0 && !lista.error ? (
        <div className="mt-6 rounded-painel border border-pauta bg-folha px-5 py-6">
          <p className="font-display text-titulo font-600 text-ouro">{filtrosAtivos ? "Ninguém nesta faixa" : "Nenhum devedor com saldo"}</p>
          <p className="mt-1 max-w-[60ch] text-[0.9375rem] text-lapis">
            {filtrosAtivos ? "Troque a faixa ou limpe os filtros para ver mais gente." : "Quando houver devedores com saldo em aberto, eles aparecem aqui pela data de vencimento."}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-5 text-sm2 text-lapis">
            {num(total)} {total === 1 ? "devedor" : "devedores"} neste filtro
            {paginas > 1 ? ` · página ${pagina} de ${num(paginas)}` : ""} · <span className="font-mono tabnums text-texto">{brl(saldoDaPagina)}</span> em aberto {paginas > 1 ? "nesta página" : "no total"}
          </p>
          <ul role="list" className="mt-2 border-y border-pauta bg-folha">
            {linhas.map((l) => {
              const atraso = tempoEmAtraso(l.vencimento, hoje);
              const leitura = triagem(faixaDoVencimento(l.vencimento, hoje), l.prescricao_em, hoje);
              return (
                <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-b border-pauta px-4 py-3 last:border-b-0 sm:px-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)_10rem_auto] lg:items-center">
                  <span className="min-w-0">
                    <Link href={`/devedores/${l.id}`} className="alvo-toque block truncate font-700 text-texto hover:text-tinta hover:underline" title={l.nome}>{l.nome}</Link>
                    <span className="block truncate text-meta text-lapis">
                      <span className="font-mono">{mascararCPF(l.cpf_cnpj)}</span>
                      {l.processo ? <> · <span className="font-mono">{l.processo}</span></> : null}
                      {l.carteiras?.nome ? <> · <span title={l.carteiras.nome}>{l.carteiras.nome}</span></> : null}
                    </span>
                  </span>
                  <span className="order-3 col-span-2 min-w-0 text-sm2 lg:order-none lg:col-span-1">
                    <span className="block font-600 text-texto">{atraso.texto}</span>
                    {/* sem data, a linha de cima já diz tudo; data no futuro não "venceu" */}
                    {l.vencimento && <span className="block whitespace-nowrap font-mono text-meta tabnums text-lapis">{atraso.dias > 0 ? "venceu em" : "dia"} {dataLonga(l.vencimento)}</span>}
                  </span>
                  <span className="order-4 col-span-2 min-w-0 text-sm2 lg:order-none lg:col-span-1">
                    <span className={cn("block", leitura.tom === "neutro" ? "" : "font-600", COR[leitura.tom])}>{leitura.texto}</span>
                    {l.prescricao_em && <span className="block whitespace-nowrap font-mono text-meta tabnums text-lapis">{leitura.tom === "atraso" ? "desde" : "até"} {dataLonga(l.prescricao_em)}</span>}
                  </span>
                  <span className="whitespace-nowrap text-right font-mono text-[0.9375rem] tabnums text-texto">{brl(Number(l.saldo))}</span>
                  <Link href={`/devedores/${l.id}?aba=juridico`} className="alvo-toque order-5 col-span-2 inline-flex h-8 w-fit items-center rounded-controle border border-pauta-forte px-3 text-sm2 font-600 text-tinta transition-colors duration-150 hover:bg-tinta-clara lg:order-none lg:col-span-1 lg:justify-self-end">
                    Ver no Jurídico
                  </Link>
                </li>
              );
            })}
          </ul>
          {paginas > 1 && (
            <nav aria-label="Páginas" className="mt-4 flex items-center justify-between gap-3">
              {pagina > 1
                ? <Link href={enderecoAtraso(f, { p: pagina > 2 ? String(pagina - 1) : "" })} className={estiloBotao("outline")}>Anterior</Link>
                : <span className={cn(estiloBotao("outline"), "pointer-events-none opacity-45")} aria-disabled="true">Anterior</span>}
              <span className="font-mono text-sm2 tabnums text-lapis">{pagina} / {num(paginas)}</span>
              {pagina < paginas
                ? <Link href={enderecoAtraso(f, { p: String(pagina + 1) })} className={estiloBotao("outline")}>Próxima</Link>
                : <span className={cn(estiloBotao("outline"), "pointer-events-none opacity-45")} aria-disabled="true">Próxima</span>}
            </nav>
          )}
        </>
      )}
      <TrocaDados rota="/atraso" atual={caso} />
    </div>
  );
}
