import { supabaseAdmin } from "@/lib/supabase-server";
import type { Sessao } from "@/lib/auth";
import { calcularProdutividade, canalDaOcorrencia, type Evento, type Meta, type Pessoa } from "@/lib/produtividade";
import { NOME_PAPEL, type Papel } from "@/lib/auth";
import { cn, num } from "@/lib/utils";
import { diaISO, hora, instanteSP, porExtenso, deDiaISO } from "@/lib/datas";
import { MetasEquipe } from "./metas";

const LIMITE = 5000;
const umDecimal = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Produtividade da equipe no Painel (V5.6.13/14). Quem gere (admin e dono da operação) vê a equipe
 * inteira, o ranking e define as metas; o "só leitura" vê a equipe; o negociador vê só a si mesmo.
 * Quem não trabalhou no dia continua na lista: a gestão precisa ver quem está zerado.
 */
export async function Produtividade({ sessao, dia, carteira, carteiras }: { sessao: Sessao; dia: string; carteira: number | null; carteiras: { id: number; nome: string }[] }) {
  const adm = supabaseAdmin();
  const gestao = sessao.role === "admin" || sessao.role === "cobrador";
  const veEquipe = gestao || sessao.role === "visualizador";

  // Equipe visível
  let equipe: Pessoa[] = [];
  if (sessao.role === "negociador" || !veEquipe) {
    equipe = [{ id: sessao.user.id, nome: sessao.nome, papel: NOME_PAPEL[sessao.role] }];
  } else {
    let q = adm.from("usuarios_app").select("id, nome, role").in("role", ["cobrador", "negociador"]);
    if (sessao.role !== "admin" && sessao.tenant) q = q.or(`id.eq.${sessao.tenant},cobrador_id.eq.${sessao.tenant}`);
    const { data } = await q.order("nome");
    equipe = (data ?? []).map((u) => ({ id: u.id, nome: u.nome ?? "Sem nome", papel: NOME_PAPEL[u.role as Papel] ?? u.role }));
  }
  const ids = equipe.map((p) => p.id);

  const [a, m, d] = dia.split("-").map(Number);
  const ini = instanteSP(a, m, d).toISOString();
  const fim = instanteSP(a, m, d + 1).toISOString();
  const [ocs, msgs, metasRows] = ids.length ? await Promise.all([
    adm.from("ocorrencias").select("devedor_id, carteira_id, autor_id, canal, resultado, criado_em")
      .in("autor_id", ids).gte("criado_em", ini).lt("criado_em", fim).neq("resultado", "anotacao").neq("canal", "sistema").limit(LIMITE),
    adm.from("mensagens").select("autor_id, criado_em, conversas!inner(devedor_id, carteira_id)")
      .in("autor_id", ids).eq("origem", "humano").eq("direcao", "saida").eq("privado", false).eq("simulacao", false)
      .gte("criado_em", ini).lt("criado_em", fim).limit(LIMITE),
    adm.from("metas_produtividade").select("usuario_id, meta_clientes, meta_acionamentos").in("usuario_id", ids),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];

  const eventos: Evento[] = [];
  for (const o of (ocs.data ?? []) as { devedor_id: number; carteira_id: number | null; autor_id: string; canal: string; criado_em: string }[]) {
    if (carteira && o.carteira_id !== carteira) continue;
    eventos.push({ autor: o.autor_id, devedor: o.devedor_id, carteira: o.carteira_id, canal: canalDaOcorrencia(o.canal), tipo: "ocorrencia", em: o.criado_em });
  }
  for (const x of (msgs.data ?? []) as unknown as { autor_id: string; criado_em: string; conversas: { devedor_id: number; carteira_id: number | null } }[]) {
    if (carteira && x.conversas.carteira_id !== carteira) continue;
    eventos.push({ autor: x.autor_id, devedor: x.conversas.devedor_id, carteira: x.conversas.carteira_id, canal: "whatsapp", tipo: "mensagem", em: x.criado_em });
  }
  const metas = new Map<string, Meta>(((metasRows.data ?? []) as { usuario_id: string; meta_clientes: number; meta_acionamentos: number }[])
    .map((r) => [r.usuario_id, { clientes: r.meta_clientes, acionamentos: r.meta_acionamentos }]));
  const p = calcularProdutividade(eventos, equipe, metas);
  const nomeCarteira = new Map(carteiras.map((c) => [c.id, c.nome]));
  const ranking = p.pessoas.filter((x) => x.acionamentos > 0).slice(0, 3);
  const ehHoje = dia === diaISO();

  const kpis = [
    { rotulo: "Acionamentos", valor: num(p.totais.acionamentos) },
    { rotulo: "Clientes trabalhados", valor: num(p.totais.clientes) },
    { rotulo: "Por hora com atividade", valor: umDecimal(p.totais.porHora) },
    { rotulo: "Metas batidas", valor: `${p.totais.metasBatidas} de ${p.totais.equipe}` },
  ];

  return (
    <section aria-labelledby="t-produtividade" className="mt-6 rounded-painel border border-pauta bg-folha">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-pauta px-5 py-3.5">
        <div className="min-w-0">
          <h2 id="t-produtividade" className="font-display text-titulo font-600 text-ouro">{veEquipe ? "Produtividade da equipe" : "Sua produtividade"}</h2>
          <p className="mt-0.5 text-sm2 text-lapis">{ehHoje ? "Hoje" : porExtenso(deDiaISO(dia))}{carteira ? ` · ${nomeCarteira.get(carteira) ?? "carteira"}` : ""}</p>
        </div>
        <form action="/" className="flex flex-wrap items-end gap-2">
          <label className="text-sm2 font-600">
            <span className="mb-1 block">Dia</span>
            <input type="date" name="prod_dia" defaultValue={dia} max={diaISO()} className="h-10 rounded-controle border border-pauta-forte bg-folha px-2.5 font-mono text-[0.9375rem] outline-none focus:border-tinta [@media(pointer:coarse)]:h-11" />
          </label>
          {veEquipe && (
            <label className="text-sm2 font-600">
              <span className="mb-1 block">Carteira</span>
              <select name="prod_carteira" defaultValue={carteira ?? ""} className="h-10 max-w-[14rem] rounded-controle border border-pauta-forte bg-folha px-2.5 text-[0.9375rem] outline-none focus:border-tinta [@media(pointer:coarse)]:h-11">
                <option value="">Todas</option>
                {carteiras.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          )}
          <button type="submit" className="h-10 rounded-botao border border-pauta-forte bg-folha px-4 text-[0.9375rem] font-600 text-tinta transition-colors duration-150 hover:bg-tinta-clara active:scale-[0.97] [@media(pointer:coarse)]:h-11">Ver</button>
        </form>
      </div>

      <dl className="grid grid-cols-2 border-b border-pauta sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.rotulo} className="min-w-0 px-5 py-3 shadow-[1px_0_0_0_rgb(var(--c-line)),0_1px_0_0_rgb(var(--c-line))]">
            <dt className="text-meta font-600 text-lapis">{k.rotulo}</dt>
            <dd className="mt-0.5 font-mono text-[1.125rem] font-600 tabnums text-ouro">{k.valor}</dd>
          </div>
        ))}
      </dl>

      {veEquipe && ranking.length > 0 && (
        <ol aria-label="Quem mais trabalhou clientes" className="grid border-b border-pauta sm:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ ["--n" as string]: ranking.length }}>
          {ranking.map((r) => (
            <li key={r.pessoa.id} className="flex items-center gap-3 px-5 py-3 shadow-[1px_0_0_0_rgb(var(--c-line)),0_1px_0_0_rgb(var(--c-line))]">
              <span className="font-mono text-[1.125rem] font-600 tabnums text-tinta">{r.posicao}º</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-700 text-texto">{r.pessoa.nome}</span>
                <span className="block text-meta text-lapis">{num(r.acionamentos)} acionamentos · {umDecimal(r.porHora)} por hora</span>
              </span>
              <span className="text-right">
                <span className="block font-mono text-[1.125rem] font-600 tabnums text-ouro">{num(r.clientes)}</span>
                <span className="block text-meta text-lapis">{r.clientes === 1 ? "cliente" : "clientes"}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {p.pessoas.length === 0 ? (
        <p className="px-5 py-5 text-[0.9375rem] text-lapis">Ninguém na equipe ainda. As pessoas entram em Configurações → Equipe.</p>
      ) : (
        <>
        {/* Rótulos uma vez só, alinhados com as colunas das linhas */}
        <div aria-hidden="true" className={cn("hidden border-b border-pauta text-meta font-600 text-lapis md:grid", veEquipe ? "grid-cols-[56px_minmax(0,1fr)]" : "grid-cols-1")}>
          {veEquipe && <span />}
          <span className={COLUNAS}>
            <span>Pessoa</span><span className="text-right">Acionamentos</span><span className="text-right">Clientes</span><span className="text-right">Por hora</span>
            <span className="hidden lg:block">Meta de clientes</span><span className="hidden lg:block">Meta de acionamentos</span>
          </span>
        </div>
        <ul role="list" className={cn("pagina-pautada", veEquipe ? "[--margem:56px]" : "[--margem:0px]")}>
          {p.pessoas.map((r) => (
            <li key={r.pessoa.id} className={cn("grid border-b border-pauta last:border-b-0", veEquipe ? "grid-cols-[var(--margem)_minmax(0,1fr)]" : "grid-cols-1")}>
              {veEquipe && <span className={cn("px-3 py-3 text-right font-mono text-sm2 tabnums", r.acionamentos ? "text-tinta" : "text-lapis")}>{r.posicao}º</span>}
              <div className={cn(COLUNAS, "items-center")}>
                <span className="min-w-0">
                  <span className="block truncate font-700 text-texto">{r.pessoa.nome}</span>
                  <span className="block text-sm2 text-lapis">
                    {r.pessoa.papel}{r.horasAtivas ? ` · ${r.horasAtivas} ${r.horasAtivas === 1 ? "hora" : "horas"} com atividade` : " · sem atividade no dia"}{r.ultimo ? ` · último às ${hora(r.ultimo)}` : ""}
                  </span>
                  <span className="block text-sm2 text-lapis md:hidden">
                    <span className="font-mono tabnums text-texto">{num(r.acionamentos)}</span> acionamentos · <span className="font-mono tabnums text-texto">{num(r.clientes)}</span> clientes · {umDecimal(r.porHora)}/h
                  </span>
                </span>
                <Numero valor={num(r.acionamentos)} detalhe={r.acionamentos ? `${r.whatsapp} WhatsApp · ${r.ligacoes} lig.` : undefined} />
                <Numero valor={num(r.clientes)} />
                <Numero valor={umDecimal(r.porHora)} />
                <BarraMeta rotulo="Meta de clientes" feito={r.clientes} meta={r.meta.clientes} />
                <BarraMeta rotulo="Meta de acionamentos" feito={r.acionamentos} meta={r.meta.acionamentos} />
              </div>
            </li>
          ))}
        </ul>
        </>
      )}

      {veEquipe && p.carteiras.length > 0 && (
        <div className="border-t border-pauta px-5 py-4">
          <h3 className="font-700 text-texto">Onde a equipe trabalhou</h3>
          <ul className="mt-2 divide-y divide-pauta">
            {p.carteiras.map((c) => (
              <li key={c.carteira} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                <span className="font-600 text-texto">{nomeCarteira.get(c.carteira) ?? `Carteira ${c.carteira}`}</span>
                <span className="text-sm2 text-lapis">
                  <span className="font-mono tabnums text-texto">{num(c.acionamentos)}</span> acionamentos · <span className="font-mono tabnums text-texto">{num(c.clientes)}</span> clientes ·{" "}
                  {c.pessoas} {c.pessoas === 1 ? "pessoa" : "pessoas"} · {umDecimal(c.porCliente)} por cliente
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {gestao && p.pessoas.length > 0 && (
        <MetasEquipe pessoas={p.pessoas.map((r) => ({ id: r.pessoa.id, nome: r.pessoa.nome, papel: r.pessoa.papel, clientes: r.meta.clientes, acionamentos: r.meta.acionamentos }))} />
      )}
      <p className="border-t border-pauta px-5 py-3 text-meta text-lapis">
        Acionamento é cada contato: a conversa pelo WhatsApp do sistema ou o resultado registrado na ficha. O resultado lançado até 20 minutos depois de falar com o mesmo cliente é o fechamento daquele contato e não conta de novo. Por hora usa só as horas em que a pessoa trabalhou.
      </p>
    </section>
  );
}

// Pessoa, três números e as duas metas: as mesmas colunas no cabeçalho e em cada linha
const COLUNAS = "grid min-w-0 gap-x-6 gap-y-2 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_repeat(3,6.5rem)] lg:grid-cols-[minmax(0,1fr)_repeat(3,6.5rem)_minmax(0,9rem)_minmax(0,9rem)]";

function Numero({ valor, detalhe }: { valor: string; detalhe?: string }) {
  return (
    <span className="hidden md:block md:text-right">
      <span className="block font-mono text-[0.9375rem] font-600 tabnums text-texto">{valor}</span>
      {detalhe && <span className="block whitespace-nowrap text-meta text-lapis">{detalhe}</span>}
    </span>
  );
}

function BarraMeta({ rotulo, feito, meta }: { rotulo: string; feito: number; meta: number }) {
  if (!meta) return <span className="hidden text-sm2 text-lapis lg:block">sem meta</span>;
  const pct = Math.min(100, (feito / meta) * 100);
  const bateu = feito >= meta;
  return (
    <span className="block md:col-span-2 lg:col-span-1">
      <span className="flex items-baseline justify-between gap-2 text-meta">
        <span className="text-lapis lg:sr-only">{rotulo}</span>
        <span className={cn("font-mono tabnums", bateu ? "font-600 text-pago" : "text-texto")}>{num(feito)}/{num(meta)}</span>
      </span>
      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-pauta" role="img" aria-label={`${rotulo}: ${num(feito)} de ${num(meta)}`}>
        <span className={cn("block h-full rounded-full", bateu ? "bg-pago" : "bg-tinta")} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
