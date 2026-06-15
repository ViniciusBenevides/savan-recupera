import { supabaseServer } from "@/lib/supabase-server";
import { Card, SectionTitle, Badge, Input } from "@/components/ui/primitives";
import { brl, num, dataBR } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, any> = {
  pago: "green", pix_gerado: "amber", em_negociacao: "violet", contatado: "blue",
  na_fila: "neutral", sem_whatsapp: "neutral", nao_perturbe: "neutral",
  recusado: "rose", contestado: "rose", arquivado: "neutral", pendente: "neutral",
};

export default async function DevedoresPage({ searchParams }: { searchParams: Promise<{ q?: string; pg?: string }> }) {
  const { q, pg } = await searchParams;
  const pagina = Math.max(1, Number(pg ?? 1));
  const porPag = 25;
  const sb = await supabaseServer();

  let query = sb.from("devedores")
    .select("id, nome, cpf_cnpj, saldo, vencimento, uf, cidade, status_cobranca, processo", { count: "exact" })
    .order("prioridade", { ascending: false })
    .range((pagina - 1) * porPag, pagina * porPag - 1);
  if (q) query = query.or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${q}%,processo.ilike.%${q}%`);

  const { data: devedores, count } = await query;
  const totalPag = Math.ceil((count ?? 0) / porPag);

  return (
    <>
      <SectionTitle title="Devedores" sub={`${num(count ?? 0)} registros na carteira.`} />

      <form className="mb-4">
        <Input name="q" defaultValue={q ?? ""} placeholder="Buscar por nome, CPF ou processo…" className="max-w-md" />
      </form>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mist">
                <th className="px-5 py-3 font-medium">Devedor</th>
                <th className="px-5 py-3 font-medium">Cidade</th>
                <th className="px-5 py-3 font-medium">Dívida</th>
                <th className="px-5 py-3 font-medium">Vencimento</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(devedores ?? []).map((d) => (
                <tr key={d.id} className="border-b border-line/50 transition-colors hover:bg-ink-850">
                  <td className="px-5 py-3">
                    <Link href={`/devedores/${d.id}`} className="font-medium text-chalk hover:text-emerald">{d.nome}</Link>
                    <div className="font-mono text-[11px] text-mist tabnums">{d.cpf_cnpj}</div>
                  </td>
                  <td className="px-5 py-3 text-mist">{d.cidade ?? "—"}{d.uf ? `, ${d.uf}` : ""}</td>
                  <td className="px-5 py-3 font-mono text-chalk tabnums">{brl(d.saldo)}</td>
                  <td className="px-5 py-3 text-mist">{dataBR(d.vencimento)}</td>
                  <td className="px-5 py-3">
                    <Badge tone={STATUS_TONE[d.status_cobranca] ?? "neutral"}>{d.status_cobranca.replace(/_/g, " ")}</Badge>
                  </td>
                </tr>
              ))}
              {(devedores ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-mist">Nenhum devedor encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPag > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {pagina > 1 && (
            <Link href={`/devedores?${q ? `q=${q}&` : ""}pg=${pagina - 1}`}
                  className="rounded-lg border border-line px-3 py-1.5 text-mist hover:text-chalk">Anterior</Link>
          )}
          <span className="text-mist">Página {pagina} de {totalPag}</span>
          {pagina < totalPag && (
            <Link href={`/devedores?${q ? `q=${q}&` : ""}pg=${pagina + 1}`}
                  className="rounded-lg border border-line px-3 py-1.5 text-mist hover:text-chalk">Próxima</Link>
          )}
        </div>
      )}
    </>
  );
}
