import { supabaseServer } from "@/lib/supabase-server";
import { StatCard } from "@/components/StatCard";
import { Card, SectionTitle, Badge } from "@/components/ui/primitives";
import { RecuperacaoChart, Funil } from "@/components/charts";
import { RealtimeFeed } from "@/components/RealtimeFeed";
import { brl, num, pct } from "@/lib/utils";
import { HandCoins, Wallet, Send, MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const sb = await supabaseServer();

  const [{ data: funil }, { data: metricas }, { data: pagamentos }, { data: cfg }, { data: chips }] =
    await Promise.all([
      sb.from("v_funil").select("*").maybeSingle(),
      sb.from("metricas_diarias").select("*").order("dia", { ascending: true }).limit(30),
      sb.from("pagamentos").select("id, valor, status, criado_em, devedores(nome)").order("criado_em", { ascending: false }).limit(12),
      sb.from("configuracoes").select("chave, valor").in("chave", ["campanha_ativa", "modo_simulacao"]),
      sb.from("chip_metricas_diarias").select("novos_contatos, dia"),
    ]);

  const f = funil ?? {} as any;
  const hoje = new Date().toISOString().slice(0, 10);
  const mHoje = (metricas ?? []).find((m) => m.dia === hoje);
  const enviadosHoje = (chips ?? []).filter((c) => c.dia === hoje).reduce((s, c) => s + (c.novos_contatos ?? 0), 0);

  const taxaResposta = f.contatados ? (f.responderam / f.contatados) * 100 : 0;
  const ativa = (cfg ?? []).find((c) => c.chave === "campanha_ativa")?.valor === true;
  const simulacao = (cfg ?? []).find((c) => c.chave === "modo_simulacao")?.valor === true;

  const chartData = (metricas ?? []).map((m) => ({
    dia: new Date(m.dia + "T12:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    valor: Number(m.valor_recuperado ?? 0),
  }));

  const feed = (pagamentos ?? []).map((p: any) => ({
    id: p.id, valor: p.valor, status: p.status, criado_em: p.criado_em,
    devedor_nome: p.devedores?.nome,
  }));

  return (
    <>
      <SectionTitle
        title="Visão geral"
        sub="Resultados da campanha de recuperação em tempo real."
        action={
          <div className="flex items-center gap-2">
            {simulacao && <Badge tone="amber">Modo simulação</Badge>}
            <Badge tone={ativa ? "green" : "neutral"}>
              <span className={`h-2 w-2 rounded-full ${ativa ? "bg-emerald animate-pulseglow" : "bg-mist"}`} />
              {ativa ? "Campanha ativa" : "Campanha parada"}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Recuperado" value={brl(f.valor_recuperado)} tone="green" icon={Wallet} glow
                  hint="total quitado" />
        <StatCard label="Sua comissão" value={brl(f.comissao_total)} tone="violet" icon={HandCoins}
                  hint="10% do recuperado" />
        <StatCard label="Pix gerados" value={num(f.pix_gerados)} icon={Send}
                  hint={`${num(mHoje?.pix_gerados ?? 0)} hoje`} />
        <StatCard label="Taxa de resposta" value={pct(taxaResposta)} tone="amber" icon={MessageCircle}
                  hint={`${num(f.responderam)} responderam`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-600 text-chalk">Recuperação diária</h3>
            <span className="text-xs text-mist">Enviados hoje: <span className="font-mono text-chalk tabnums">{num(enviadosHoje)}</span></span>
          </div>
          {chartData.length > 0
            ? <RecuperacaoChart data={chartData} />
            : <div className="grid h-[240px] place-items-center text-sm text-mist">Sem dados ainda — comece a campanha para ver os resultados.</div>}
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
              ["Em negociação", num((f.negociando ?? 0))],
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
