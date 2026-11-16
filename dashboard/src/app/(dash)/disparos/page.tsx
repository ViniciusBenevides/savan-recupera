import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { getSessao, podeEscrever } from "@/lib/auth";
import { getConfigEscopo } from "@/lib/config";
import { SectionTitle } from "@/components/ui/primitives";
import { semContatoUtil } from "@/lib/recuperacao";
import { TrocaDados } from "@/components/dev/TrocaDados";
import { casoDeTeste, vistaDisparos } from "@/lib/dev/pior-caso";
import type { LinhaDisparo, VistaDisparos } from "@/lib/vistas";
import { cn, contar, num } from "@/lib/utils";
import { diaISO } from "@/lib/datas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disparos e automação" };

const SITUACAO_CARTEIRA: Record<string, { t: string; cor: string }> = {
  ativa: { t: "Ativa", cor: "text-pago" },
  pausada: { t: "Pausada", cor: "text-lapis" },
  importando: { t: "Importando", cor: "text-atencao" },
  arquivada: { t: "Arquivada", cor: "text-lapis" },
};
const SITUACAO_LINHA: Record<string, { t: string; cor: string }> = {
  ativo: { t: "Ativa", cor: "text-pago" },
  aquecendo: { t: "Aquecendo", cor: "text-atencao" },
  conectado: { t: "Conectada", cor: "text-texto" },
  cadastrado: { t: "Cadastrada, falta conectar", cor: "text-lapis" },
  pausado: { t: "Pausada", cor: "text-lapis" },
  desconectado: { t: "Desconectada", cor: "text-margem" },
  banido: { t: "Banida", cor: "text-margem" },
};
const finalDoNumero = (e164: string | null) => (e164 ? `final ${e164.replace(/\D/g, "").slice(-4)}` : "sem número");

/**
 * Disparos e automação (o "Central Automação + IA" da V5.7.47 em diante): numa tela só, se a
 * campanha está ligada, o que o robô tem para chamar em cada carteira, por quais linhas e o que
 * já saiu hoje. Aqui só se lê; cada coisa é mexida na tela dela, com os controles de sempre.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ dados?: string }> }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (!["admin", "cobrador", "visualizador"].includes(sessao.role)) redirect("/");
  const sb = await supabaseServer();
  const adm = supabaseAdmin();
  const hoje = diaISO();

  const [{ data: carteirasRaw }, { data: chipsRaw }, cfg] = await Promise.all([
    sb.from("carteiras").select("id, nome, status, num_devedores").order("nome"),
    sb.from("chips").select("*").order("id"),
    getConfigEscopo(sessao.role === "admin" ? null : sessao.tenant),
  ]);
  const carteiras = ((carteirasRaw ?? []) as { id: number; nome: string; status: string; num_devedores: number }[]).filter((c) => c.status !== "arquivada");
  const linhas = ((chipsRaw ?? []) as { id: number; nome: string; numero_e164: string | null; status: string; excluido_em?: string | null }[]).filter((c) => !c.excluido_em);
  const ids = carteiras.map((c) => c.id);
  const idsLinhas = linhas.map((l) => l.id);

  const cabeca = (status: string, carteira: number) => sb.from("fila_envios").select("id", { count: "exact", head: true }).eq("status", status).eq("carteira_id", carteira);
  const [resumos, aguardando, enviados, falhas, { data: vinculos }, { data: metricas }] = await Promise.all([
    Promise.all(ids.map((id) => adm.rpc("fn_fila_carteira_resumo", { p_carteira_id: id }))),
    Promise.all(ids.map((id) => cabeca("aguardando", id))),
    Promise.all(ids.map((id) => cabeca("enviado", id))),
    Promise.all(ids.map((id) => cabeca("falha", id))),
    adm.from("carteira_chips").select("carteira_id, chip_id").in("carteira_id", ids.length ? ids : [-1]),
    sb.from("chip_metricas_diarias").select("chip_id, novos_contatos").eq("dia", hoje).in("chip_id", idsLinhas.length ? idsLinhas : [-1]),
  ]);

  const enviadosHojePorLinha = new Map<number, number>();
  for (const m of (metricas ?? []) as { chip_id: number; novos_contatos: number | null }[]) enviadosHojePorLinha.set(m.chip_id, (enviadosHojePorLinha.get(m.chip_id) ?? 0) + Number(m.novos_contatos ?? 0));
  const linhasPorCarteira = new Map<number, number[]>();
  for (const v of (vinculos ?? []) as { carteira_id: number; chip_id: number }[]) linhasPorCarteira.set(v.carteira_id, [...(linhasPorCarteira.get(v.carteira_id) ?? []), v.chip_id]);
  const prontas = new Set(linhas.filter((l) => ["ativo", "aquecendo"].includes(l.status)).map((l) => l.id));

  const tabela = carteiras.map((c, i) => {
    const r = (resumos[i].data ?? null) as { acionaveis: number; nao_acionaveis: number; motivos: Record<string, number> } | null;
    const vinculadas = (linhasPorCarteira.get(c.id) ?? []).filter((id) => idsLinhas.includes(id));
    const comLinhaPronta = vinculadas.some((id) => prontas.has(id));
    const naFila = aguardando[i].count ?? 0;
    // Em uma frase, o que o robô vai fazer com esta carteira agora
    const leitura = c.status !== "ativa"
      ? "O robô não abre conversa nesta carteira."
      : !comLinhaPronta
        ? "Ativa, mas sem linha conectada vinculada: nada sai."
        : naFila === 0
          ? "Ativa, com linha, mas sem ninguém na fila do robô."
          : cfg.campanha_ativa === true
            ? "O robô abre conversa no ritmo de cada linha."
            : "Pronta para enviar, mas a campanha está desligada.";
    return {
      ...c, acionaveis: r?.acionaveis ?? 0, naoAcionaveis: r?.nao_acionaveis ?? 0, higienizar: semContatoUtil(r?.motivos), naFila,
      enviados: enviados[i].count ?? 0, falhas: falhas[i].count ?? 0, linhas: vinculadas.length, leitura,
      saindo: c.status === "ativa" && comLinhaPronta && naFila > 0 && cfg.campanha_ativa === true,
    };
  });

  // O que a tela desenha. No ambiente de desenvolvimento, ?dados=pior|vazio|um troca pelo pior caso.
  const linhasVista: LinhaDisparo[] = linhas.map((l) => ({
    id: l.id, nome: l.nome, numero_e164: l.numero_e164, status: l.status, enviadosHoje: enviadosHojePorLinha.get(l.id) ?? 0,
    carteiras: tabela.filter((c) => (linhasPorCarteira.get(c.id) ?? []).includes(l.id)).length,
  }));
  const real: VistaDisparos = { ligada: cfg.campanha_ativa === true, simulacao: cfg.modo_simulacao === true, carteiras: tabela, linhas: linhasVista };
  const caso = casoDeTeste((await searchParams).dados);
  const v = caso ? vistaDisparos(caso) : real;

  const { ligada, simulacao } = v;
  const enviadosHoje = v.linhas.reduce((s, l) => s + l.enviadosHoje, 0);
  const totalFila = v.carteiras.reduce((s, c) => s + c.naFila, 0);
  const totalFalhas = v.carteiras.reduce((s, c) => s + c.falhas, 0);
  const saindoDe = v.carteiras.filter((c) => c.saindo).length;
  const prontasN = v.linhas.filter((l) => ["ativo", "aquecendo"].includes(l.status)).length;
  const configura = podeEscrever(sessao.role);
  const numeros = [
    // Ligada e sem nada saindo é o caso que engana: a chave está certa, mas falta linha, fila ou carteira ativa
    {
      rotulo: "Campanha", valor: ligada ? "Ligada" : "Desligada", cor: !ligada ? "text-lapis" : saindoDe > 0 && !simulacao ? "text-pago" : "text-ouro",
      nota: !ligada ? "nenhuma abordagem sai" : simulacao ? "em simulação: nada é enviado de verdade" : saindoDe > 0 ? contar(saindoDe, "carteira enviando", "carteiras enviando") : "mas nenhuma carteira está enviando",
    },
    { rotulo: "Linhas prontas", valor: `${num(prontasN)} de ${num(v.linhas.length)}`, cor: prontasN ? "text-ouro" : "text-lapis", nota: v.linhas.length ? "conectadas e liberadas para abordar" : "nenhuma linha cadastrada" },
    { rotulo: "Abordagens hoje", valor: num(enviadosHoje), cor: "text-ouro", nota: "conversas abertas pelo robô" },
    { rotulo: "Na fila do robô", valor: num(totalFila), cor: "text-ouro", nota: "esperando a vez" },
    { rotulo: "Envios com falha", valor: num(totalFalhas), cor: totalFalhas ? "text-margem" : "text-ouro", nota: totalFalhas ? "parados na fila" : "nada parado" },
  ];
  const atalhos = [
    { href: "/relatorios?aba=robo", t: "Chave da campanha", s: "Ligar, desligar ou pôr em simulação, e ver o que o robô já fez." },
    { href: "/ajustes?aba=envio", t: "Dias e horários de envio", s: "Quando o robô pode abrir conversa." },
    { href: "/ajustes?aba=chips", t: "Linhas WhatsApp", s: "Conectar por QR, pausar e ver a saúde de cada número." },
    { href: "/carteiras", t: "Fluxo do robô de cada carteira", s: "O que ele diz ao abrir a conversa e como segue." },
  ];

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <SectionTitle
        title="Disparos e automação"
        sub="O que o robô tem para chamar em cada carteira, por quais linhas, e o que já saiu hoje."
      />

      <dl className="grid grid-cols-2 overflow-hidden rounded-painel border border-pauta bg-folha sm:grid-cols-3 lg:grid-cols-5">
        {numeros.map((k) => (
          <div key={k.rotulo} className="min-w-0 px-4 py-3.5 shadow-[1px_0_0_0_rgb(var(--c-line)),0_1px_0_0_rgb(var(--c-line))]">
            <dt className="text-meta font-600 text-lapis">{k.rotulo}</dt>
            <dd className={cn("mt-1 font-mono text-[1.125rem] font-600 leading-tight tabnums", k.cor)}>{k.valor}</dd>
            <dd className="mt-0.5 text-meta text-lapis">{k.nota}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 max-w-[80ch] text-meta text-lapis">
        O robô só abre a conversa, pede licença e segue o fluxo da carteira. Quem responde vem para a equipe em Mensagens WhatsApp e no Trabalho de hoje.
        {configura ? <> Ligar ou desligar a campanha fica em <Link href="/relatorios?aba=robo" className="font-600 text-tinta underline">Relatórios &amp; BI, na aba Robô</Link>.</> : null}
      </p>

      <section aria-labelledby="t-carteiras" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="t-carteiras" className="font-display text-titulo font-600 text-ouro">Carteiras</h2>
          <Link href="/carteiras" className="alvo-toque text-sm2 font-600 text-tinta hover:underline">Credores / carteiras</Link>
        </div>
        {v.carteiras.length === 0 ? (
          <div className="mt-3 rounded-painel border border-pauta bg-folha px-5 py-6">
            <p className="font-display text-titulo font-600 text-ouro">Nenhuma carteira ainda</p>
            <p className="mt-1 max-w-[60ch] text-[0.9375rem] text-lapis">Importe a planilha de uma carteira em Credores / carteiras. Ela entra pausada: nada é enviado até você ativar.</p>
          </div>
        ) : (
          <ul role="list" className="mt-3 border-y border-pauta bg-folha">
            {v.carteiras.map((c) => {
              const s = SITUACAO_CARTEIRA[c.status] ?? SITUACAO_CARTEIRA.pausada;
              return (
                <li key={c.id} className="grid grid-cols-1 gap-x-6 gap-y-2 border-b border-pauta px-4 py-3.5 last:border-b-0 sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <Link href={`/carteiras/${c.id}`} className="alvo-toque block truncate font-700 text-texto hover:text-tinta hover:underline" title={c.nome}>{c.nome}</Link>
                    <p className="text-sm2 text-lapis"><span className={cn("font-600", s.cor)}>{s.t}</span> · {c.leitura}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm2 sm:grid-cols-4">
                    {[
                      { t: "Acionáveis agora", v: num(c.acionaveis), cor: "text-ouro" },
                      { t: "Para higienizar", v: num(c.higienizar), cor: "text-texto" },
                      { t: "Na fila do robô", v: num(c.naFila), cor: "text-texto" },
                      { t: "Linhas vinculadas", v: num(c.linhas), cor: c.status === "ativa" && c.linhas === 0 ? "text-margem" : "text-texto" },
                    ].map((x) => (
                      <div key={x.t} className="min-w-0">
                        <dt className="truncate text-meta text-lapis">{x.t}</dt>
                        <dd className={cn("font-mono text-[0.9375rem] font-600 tabnums", x.cor)}>{x.v}</dd>
                      </div>
                    ))}
                  </dl>
                  <Link href={`/carteiras/${c.id}`} className="alvo-toque inline-flex h-8 w-fit items-center rounded-controle border border-pauta-forte px-3 text-sm2 font-600 text-tinta transition-colors duration-150 hover:bg-tinta-clara lg:justify-self-end">
                    Abrir carteira
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 max-w-[80ch] text-meta text-lapis">Acionável é quem dá para chamar agora. Na fila do robô é quem ele ainda vai abordar sozinho: carteira trazida de outro sistema entra sem ninguém nessa fila.</p>
      </section>

      <section aria-labelledby="t-linhas" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="t-linhas" className="font-display text-titulo font-600 text-ouro">Linhas WhatsApp</h2>
          {configura && <Link href="/ajustes?aba=chips" className="alvo-toque text-sm2 font-600 text-tinta hover:underline">Gerenciar linhas</Link>}
        </div>
        {v.linhas.length === 0 ? (
          <div className="mt-3 rounded-painel border border-pauta bg-folha px-5 py-6">
            <p className="font-display text-titulo font-600 text-ouro">Nenhuma linha conectada</p>
            <p className="mt-1 max-w-[60ch] text-[0.9375rem] text-lapis">Sem uma linha de WhatsApp o robô não abre conversa e a equipe não responde pelo sistema. {configura ? "Conecte a primeira por QR em Linhas WhatsApp." : "Peça ao dono da operação para conectar a primeira."}</p>
          </div>
        ) : (
          <ul role="list" className="mt-3 border-y border-pauta bg-folha">
            {v.linhas.map((l) => {
              const s = SITUACAO_LINHA[l.status] ?? { t: l.status.replace(/_/g, " "), cor: "text-lapis" };
              return (
                <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 border-b border-pauta px-4 py-3 last:border-b-0 sm:px-5">
                  <span className="min-w-0">
                    <span className="block truncate font-700 text-texto" title={l.nome}>{l.nome}</span>
                    <span className="block truncate text-sm2 text-lapis">
                      <span className={cn("font-600", s.cor)}>{s.t}</span> · <span className="font-mono">{finalDoNumero(l.numero_e164)}</span> · {l.carteiras ? contar(l.carteiras, "carteira", "carteiras") : "sem carteira vinculada"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-[0.9375rem] font-600 tabnums text-texto">{num(l.enviadosHoje)}</span>
                    <span className="block text-meta text-lapis">abordagens hoje</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {configura && (
        <section aria-labelledby="t-onde" className="mt-8">
          <h2 id="t-onde" className="font-display text-titulo font-600 text-ouro">Onde mexer</h2>
          <ul role="list" className="mt-3 grid overflow-hidden rounded-painel border border-pauta bg-folha sm:grid-cols-2">
            {atalhos.map((a) => (
              <li key={a.href} className="shadow-[1px_0_0_0_rgb(var(--c-line)),0_1px_0_0_rgb(var(--c-line))]">
                <Link href={a.href} className="linha-hover block px-5 py-3.5 transition-colors duration-150">
                  <span className="block font-700 text-tinta">{a.t}</span>
                  <span className="block text-sm2 text-lapis">{a.s}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <TrocaDados rota="/disparos" atual={caso} />
    </div>
  );
}
