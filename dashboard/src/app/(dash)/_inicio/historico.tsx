import { supabaseServer } from "@/lib/supabase-server";
import { Card } from "@/components/ui/primitives";
import { RecuperacaoChart } from "@/components/charts";
import { HeatmapResposta } from "@/components/HeatmapResposta";
import { brl, num, dataBR } from "@/lib/utils";

/** Aba "Histórico" do Início — era a página Relatórios. */
export async function Historico() {
  const sb = await supabaseServer();
  const [{ data: metricas }, { data: heatmap }, { data: porTemplate }] = await Promise.all([
    sb.from("metricas_diarias").select("*").order("dia", { ascending: false }).limit(60),
    sb.from("v_resposta_por_hora").select("*"),
    sb.from("v_resposta_por_template").select("*").order("enviadas", { ascending: false }),
  ]);
  const ordenado = [...(metricas ?? [])].reverse();

  const chartData = ordenado.map((m) => ({
    dia: new Date(m.dia + "T12:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    valor: Number(m.valor_recuperado ?? 0),
  }));

  const tot = (campo: string) => (metricas ?? []).reduce((s, m: any) => s + Number(m[campo] ?? 0), 0);

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        {[
          ["Enviados", num(tot("enviados"))],
          ["Respostas", num(tot("respostas"))],
          ["Pix gerados", num(tot("pix_gerados"))],
          ["Recuperado", brl(tot("valor_recuperado"))],
        ].map(([k, v]) => (
          <Card key={k}>
            <div className="text-xs uppercase tracking-wider text-mist">{k}</div>
            <div className="mt-2 font-mono text-xl font-600 text-chalk tabnums">{v}</div>
          </Card>
        ))}
      </div>

      <Card className="mb-4">
        <h3 className="mb-4 font-display text-base font-600 text-chalk">Recuperação (60 dias)</h3>
        {chartData.length > 0 ? <RecuperacaoChart data={chartData} />
          : <div className="grid h-[240px] place-items-center text-sm text-mist">Sem dados ainda.</div>}
      </Card>

      {/* Melhor horário para abordar + qual modelo converte (§33) */}
      <div className="mb-4">
        <HeatmapResposta dados={(heatmap ?? []) as any} />
      </div>

      <Card className="mb-4 p-0">
        <div className="px-5 pt-5">
          <h3 className="font-display text-base font-600 text-chalk">Desempenho por modelo de mensagem</h3>
          <p className="mb-3 mt-1 text-xs text-mist">
            Quantas abordagens cada modelo gerou, quantas viraram conversa e quantas terminaram em pagamento.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mist">
                <th className="px-5 py-3 font-medium">Modelo</th>
                <th className="px-5 py-3 font-medium">Enviadas</th>
                <th className="px-5 py-3 font-medium">Responderam</th>
                <th className="px-5 py-3 font-medium">Taxa</th>
                <th className="px-5 py-3 font-medium">Pagaram</th>
              </tr>
            </thead>
            <tbody>
              {(porTemplate ?? []).map((t: any) => {
                const taxa = t.enviadas > 0 ? (t.responderam / t.enviadas) * 100 : 0;
                return (
                  <tr key={t.template_id} className="border-b border-line/50 hover:bg-ink-850">
                    <td className="px-5 py-3 text-chalk">{t.template}</td>
                    <td className="px-5 py-3 font-mono text-mist tabnums">{num(t.enviadas)}</td>
                    <td className="px-5 py-3 font-mono text-mist tabnums">{num(t.responderam)}</td>
                    <td className="px-5 py-3 font-mono text-emerald tabnums">{taxa.toFixed(1)}%</td>
                    <td className="px-5 py-3 font-mono text-violet tabnums">{num(t.pagaram)}</td>
                  </tr>
                );
              })}
              {(porTemplate ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-mist">Nenhuma abordagem enviada ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mist">
                <th className="px-5 py-3 font-medium">Dia</th>
                <th className="px-5 py-3 font-medium">Enviados</th>
                <th className="px-5 py-3 font-medium">Respostas</th>
                <th className="px-5 py-3 font-medium">Pix</th>
                <th className="px-5 py-3 font-medium">Pagos</th>
                <th className="px-5 py-3 font-medium">Recuperado</th>
                <th className="px-5 py-3 font-medium">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {(metricas ?? []).map((m: any) => (
                <tr key={m.dia} className="border-b border-line/50 hover:bg-ink-850">
                  <td className="px-5 py-3 text-chalk">{dataBR(m.dia)}</td>
                  <td className="px-5 py-3 font-mono text-mist tabnums">{num(m.enviados)}</td>
                  <td className="px-5 py-3 font-mono text-mist tabnums">{num(m.respostas)}</td>
                  <td className="px-5 py-3 font-mono text-mist tabnums">{num(m.pix_gerados)}</td>
                  <td className="px-5 py-3 font-mono text-mist tabnums">{num(m.pagamentos)}</td>
                  <td className="px-5 py-3 font-mono text-emerald tabnums">{brl(m.valor_recuperado)}</td>
                  <td className="px-5 py-3 font-mono text-violet tabnums">{brl(m.comissao)}</td>
                </tr>
              ))}
              {(metricas ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-mist">Sem dados ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
