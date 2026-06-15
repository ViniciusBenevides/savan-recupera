import { supabaseServer } from "@/lib/supabase-server";
import { Card, SectionTitle, Badge } from "@/components/ui/primitives";
import { StatCard } from "@/components/StatCard";
import { brl, num, dataHoraBR } from "@/lib/utils";
import { Wallet, HandCoins, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PagamentosPage() {
  const sb = await supabaseServer();
  const { data: pagamentos } = await sb
    .from("pagamentos")
    .select("id, valor, comissao_operador, status, criado_em, pago_em, devedores(nome, processo)")
    .order("criado_em", { ascending: false })
    .limit(100);

  const pagos = (pagamentos ?? []).filter((p) => ["recebido", "confirmado"].includes(p.status));
  const totalRecebido = pagos.reduce((s, p) => s + Number(p.valor), 0);
  const totalComissao = pagos.reduce((s, p) => s + Number(p.comissao_operador ?? 0), 0);
  const pendentes = (pagamentos ?? []).filter((p) => p.status === "pendente").length;

  return (
    <>
      <SectionTitle title="Pagamentos" sub="Pix gerados, recebidos e sua comissão." />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Recebido" value={brl(totalRecebido)} tone="green" icon={Wallet} glow />
        <StatCard label="Sua comissão" value={brl(totalComissao)} tone="violet" icon={HandCoins} />
        <StatCard label="Pix pendentes" value={num(pendentes)} icon={Clock} hint="aguardando pagamento" />
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mist">
                <th className="px-5 py-3 font-medium">Devedor</th>
                <th className="px-5 py-3 font-medium">Valor</th>
                <th className="px-5 py-3 font-medium">Comissão</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {(pagamentos ?? []).map((p: any) => (
                <tr key={p.id} className="border-b border-line/50 hover:bg-ink-850">
                  <td className="px-5 py-3">
                    <div className="font-medium text-chalk">{p.devedores?.nome ?? "—"}</div>
                    <div className="font-mono text-[11px] text-mist">{p.devedores?.processo}</div>
                  </td>
                  <td className="px-5 py-3 font-mono text-chalk tabnums">{brl(p.valor)}</td>
                  <td className="px-5 py-3 font-mono text-violet tabnums">{brl(p.comissao_operador)}</td>
                  <td className="px-5 py-3">
                    <Badge tone={["recebido", "confirmado"].includes(p.status) ? "green" : p.status === "pendente" ? "amber" : "neutral"}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-mist">{dataHoraBR(p.pago_em ?? p.criado_em)}</td>
                </tr>
              ))}
              {(pagamentos ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-mist">Nenhum pagamento ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
