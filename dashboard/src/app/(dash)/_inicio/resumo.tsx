import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/primitives";
import { RecuperacaoChart, Funil } from "@/components/charts";
import { RealtimeFeed } from "@/components/RealtimeFeed";
import { FilaHoje } from "@/components/FilaHoje";
import { getConfigEscopo } from "@/lib/config";
import { brl, num, pct } from "@/lib/utils";
import type { Sessao } from "@/lib/auth";
import { HandCoins, Wallet, Send, MessageCircle } from "lucide-react";
import { ChaveCampanha } from "./chave-campanha";

/**
 * "Como está indo?" numa tela só. Reúne o que antes estava espalhado em Visão geral,
 * Campanha (chave + fila de hoje) e o topo de Pagamentos.
 */
export async function Resumo({ sessao }: { sessao: Sessao | null }) {
  const sb = await supabaseServer();
  const podeEditar = !!sessao && ["admin", "cobrador"].includes(sessao.role);

  const [{ data: funil }, { data: pagosChart }, { data: pagamentos }, cfg, { data: chips }] =
    await Promise.all([
      sb.from("v_funil").select("*").maybeSingle(),
      sb.from("pagamentos").select("valor, pago_em, criado_em").in("status", ["recebido", "confirmado"]).eq("simulacao", false).order("criado_em", { ascending: true }).limit(2000),
      sb.from("pagamentos").select("id, valor, status, criado_em, devedores(nome)").order("criado_em", { ascending: false }).limit(12),
      getConfigEscopo(sessao?.tenant ?? null),
      sb.from("chip_metricas_diarias").select("novos_contatos, dia"),
    ]);

  const f = (funil ?? {}) as any;
  const hoje = new Date().toISOString().slice(0, 10);
  const enviadosHoje = (chips ?? []).filter((c) => c.dia === hoje).reduce((s, c) => s + (c.novos_contatos ?? 0), 0);
  const taxaResposta = f.contatados ? (f.responderam / f.contatados) * 100 : 0;

  const porDia = new Map<string, number>();
  for (const p of pagosChart ?? []) {
    const dia = String(p.pago_em ?? p.criado_em).slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + Number(p.valor ?? 0));
  }
  const chartData = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-30).map(([dia, valor]) => ({
    dia: new Date(dia + "T12:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    valor,
  }));

  const feed = (pagamentos ?? []).map((p: any) => ({
    id: p.id, valor: p.valor, status: p.status, criado_em: p.criado_em, devedor_nome: p.devedores?.nome,
  }));

  // Estado da operação (fila + cota do dia). Só quem opera precisa disso.
  const operacao = podeEditar ? await estadoDaOperacao(sessao!, cfg) : null;

  return (
    <>
      {operacao && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <ChaveCampanha
            ativa={cfg.campanha_ativa === true}
            simulacao={cfg.modo_simulacao === true}
            aguardando={operacao.aguardando}
            enviados={operacao.enviados}
            conta={sessao!.role === "admin" ? "global" : ""}
            podeEditar={podeEditar}
          />
          <FilaHoje dados={operacao.fila} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Recuperado" value={brl(f.valor_recuperado)} tone="green" icon={Wallet} glow hint="total quitado" />
        <StatCard label="Sua comissão" value={brl(f.comissao_total)} tone="violet" icon={HandCoins} hint="10% do recuperado" />
        <StatCard label="Pix gerados" value={num(f.pix_gerados)} icon={Send} hint="acumulado" />
        <StatCard label="Taxa de resposta" value={pct(taxaResposta)} tone="amber" icon={MessageCircle} hint={`${num(f.responderam)} responderam`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-600 text-chalk">Recuperação diária</h3>
            <span className="text-xs text-mist">Enviados hoje: <span className="font-mono text-chalk tabnums">{num(enviadosHoje)}</span></span>
          </div>
          {chartData.length > 0
            ? <RecuperacaoChart data={chartData} />
            : <div className="grid h-[240px] place-items-center text-sm text-mist">Sem dados ainda — ligue a campanha para ver os resultados.</div>}
        </Card>

        <Card>
          <h3 className="mb-4 font-display text-base font-600 text-chalk">Funil de conversão</h3>
          <Funil etapas={[
            { nome: "Base alcançável", valor: Number(f.alcancaveis ?? 0), cor: "#3A3F4F" },
            { nome: "Contatados", valor: Number(f.contatados ?? 0), cor: "#4C8DFF" },
            { nome: "Responderam", valor: Number(f.responderam ?? 0), cor: "#8B7CF6" },
            { nome: "Pix gerado", valor: Number(f.pix_gerados ?? 0), cor: "#F5B544" },
            { nome: "Pagaram", valor: Number(f.pagos ?? 0), cor: "#2BD98C" },
          ]} />
          <div className="mt-5 rounded-xl border border-line bg-ink-850 p-3 text-xs text-mist">
            Estoque total na carteira:{" "}
            <span className="font-mono font-600 text-chalk tabnums">{brl(f.estoque_total)}</span>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="mb-4 font-display text-base font-600 text-chalk">Pagamentos recentes</h3>
          <RealtimeFeed inicial={feed} />
        </Card>
        <Card>
          <h3 className="mb-4 font-display text-base font-600 text-chalk">Resumo</h3>
          <dl className="flex flex-col gap-3 text-sm">
            {[
              ["Devedores na base", num(f.total_devedores)],
              ["Com WhatsApp", num(f.alcancaveis)],
              ["Em negociação", num(f.negociando ?? 0)],
              ["Pagaram", num(f.pagos)],
              ["Conversão geral", pct(f.alcancaveis ? (f.pagos / f.alcancaveis) * 100 : 0, 2)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-line/60 pb-2 last:border-0">
                <dt className="text-mist">{k}</dt>
                <dd className="font-mono font-600 text-chalk tabnums">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}

/**
 * Fila pendente + cota do dia no escopo do ator (mesma conta que a antiga tela de Campanha usava:
 * cobrador vê só as carteiras/chips dele; admin vê o global).
 */
async function estadoDaOperacao(sessao: Sessao, cfg: Record<string, any>) {
  const admin = supabaseAdmin();
  const cobradorId = sessao.role === "cobrador" ? sessao.user.id : null;

  let carteiraIds: number[] | null = null;
  if (cobradorId) {
    const { data: carts } = await admin.from("carteiras").select("id").eq("cobrador_id", cobradorId);
    carteiraIds = (carts ?? []).map((c) => c.id);
  }
  const filtro = (q: any) => (carteiraIds ? q.in("carteira_id", carteiraIds.length ? carteiraIds : [-1]) : q);
  const { count: aguardando } = await filtro(admin.from("fila_envios").select("id", { count: "exact", head: true }).eq("status", "aguardando"));
  const { count: enviados } = await filtro(admin.from("fila_envios").select("id", { count: "exact", head: true }).eq("status", "enviado"));

  const hoje = new Date().toISOString().slice(0, 10);
  const chipsQ = admin.from("chips").select("id, status, maturidade, limite_hora_override, limite_dia_override");
  const { data: chipsEscopo } = cobradorId ? await chipsQ.eq("cobrador_id", cobradorId) : await chipsQ;
  const chipsAtivos = (chipsEscopo ?? []).filter((c) => ["ativo", "aquecendo"].includes(c.status));
  const idsAtivos = chipsAtivos.map((c) => c.id);
  const { data: metrHoje } = await admin.from("chip_metricas_diarias")
    .select("chip_id, novos_contatos").eq("dia", hoje).in("chip_id", idsAtivos.length ? idsAtivos : [-1]);

  const ritmoCfg: Record<string, any> = cfg.ritmo ?? {};
  const msgsHoraTotal = chipsAtivos.reduce(
    (s, c) => s + Number(c.limite_hora_override ?? ritmoCfg?.[c.maturidade ?? "novo"]?.msgs_hora ?? 0), 0);
  const curva: any[] = cfg.aquecimento ?? [];
  const tetoHoje = chipsAtivos.reduce((s, c) => {
    const doDia = c.limite_dia_override ?? (curva.length ? Number(curva[curva.length - 1]?.limite ?? 0) : 0);
    return s + Number(doDia);
  }, 0);

  return {
    aguardando: aguardando ?? 0,
    enviados: enviados ?? 0,
    fila: {
      pendentes: aguardando ?? 0,
      enviadosHoje: (metrHoje ?? []).reduce((s, m) => s + (m.novos_contatos ?? 0), 0),
      tetoHoje,
      chipsTotal: (chipsEscopo ?? []).length,
      chipsConectados: chipsAtivos.length,
      msgsHoraTotal,
      janela: cfg.janela_envio ?? {},
    },
  };
}
