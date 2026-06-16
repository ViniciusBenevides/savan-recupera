import { supabaseServer } from "@/lib/supabase-server";
import { Card, SectionTitle, Badge, Input, HelpHint } from "@/components/ui/primitives";
import { brl, num, dataBR } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, any> = {
  pago: "green", pix_gerado: "amber", em_negociacao: "violet", contatado: "blue",
  na_fila: "neutral", sem_whatsapp: "neutral", nao_perturbe: "neutral",
  recusado: "rose", contestado: "rose", arquivado: "neutral", pendente: "neutral",
};

// estado da conversa -> como mostrar a "resposta" do devedor
const RESPOSTA: Record<string, { tone: any; label: string }> = {
  bot_ativo: { tone: "green", label: "Respondeu" },
  humano: { tone: "violet", label: "Com humano" },
  pix_enviado: { tone: "amber", label: "Pix enviado" },
  pago: { tone: "green", label: "Pagou" },
  optout: { tone: "rose", label: "Pediu p/ parar" },
  encerrada: { tone: "neutral", label: "Encerrada" },
  aguardando_resposta: { tone: "blue", label: "Aguardando" },
};

export default async function DevedoresPage({ searchParams }: { searchParams: Promise<{ q?: string; pg?: string; carteira?: string }> }) {
  const { q, pg, carteira } = await searchParams;
  const pagina = Math.max(1, Number(pg ?? 1));
  const porPag = 25;
  const sb = await supabaseServer();

  const { data: carteiras } = await sb.from("carteiras").select("id, nome").order("nome");

  let query = sb.from("devedores")
    .select("id, nome, cpf_cnpj, saldo, vencimento, uf, cidade, status_cobranca, processo, carteira_id", { count: "exact" })
    .order("prioridade", { ascending: false })
    .range((pagina - 1) * porPag, pagina * porPag - 1);
  if (q) query = query.or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${q}%,processo.ilike.%${q}%`);
  if (carteira) query = query.eq("carteira_id", Number(carteira));

  const { data: devedores, count } = await query;
  const totalPag = Math.ceil((count ?? 0) / porPag);

  // estado da conversa por devedor (para a coluna "Resposta")
  const ids = (devedores ?? []).map((d) => d.id);
  const convPorDev = new Map<number, string>();
  if (ids.length) {
    const { data: convs } = await sb.from("conversas").select("devedor_id, estado, ultima_msg_de").in("devedor_id", ids);
    for (const c of convs ?? []) convPorDev.set(c.devedor_id, c.estado);
  }
  const nomeCarteira = new Map((carteiras ?? []).map((c) => [c.id, c.nome]));

  const qs = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (carteira) p.set("carteira", carteira);
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <SectionTitle title="Devedores" sub={`${num(count ?? 0)} registros${carteira ? " nesta carteira" : ""}.`} />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={q ?? ""} placeholder="Buscar por nome, CPF ou referência…" className="max-w-xs" />
        <select name="carteira" defaultValue={carteira ?? ""} className="h-10 rounded-xl border border-line bg-ink-850 px-3 text-sm text-chalk">
          <option value="">Todas as carteiras</option>
          {(carteiras ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <button className="h-10 rounded-xl border border-line px-4 text-sm text-chalk hover:border-ink-500 hover:bg-ink-800">Filtrar</button>
      </form>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mist">
                <th className="px-5 py-3 font-medium">Devedor</th>
                <th className="px-5 py-3 font-medium">Carteira</th>
                <th className="px-5 py-3 font-medium">Dívida</th>
                <th className="px-5 py-3 font-medium">
                  <span className="inline-flex items-center gap-1">Situação <HelpHint text="Onde o devedor está no fluxo: na fila, contatado, negociando, Pix gerado, pago…" /></span>
                </th>
                <th className="px-5 py-3 font-medium">
                  <span className="inline-flex items-center gap-1">Resposta <HelpHint text="Se o devedor respondeu e como está a conversa. Clique no nome para ver a conversa completa." /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(devedores ?? []).map((d) => {
                const estado = convPorDev.get(d.id);
                const resp = estado ? RESPOSTA[estado] : null;
                return (
                  <tr key={d.id} className="border-b border-line/50 transition-colors hover:bg-ink-850">
                    <td className="px-5 py-3">
                      <Link href={`/devedores/${d.id}`} className="font-medium text-chalk hover:text-emerald">{d.nome}</Link>
                      <div className="font-mono text-[11px] text-mist tabnums">{d.cpf_cnpj} · {d.cidade ?? "—"}{d.uf ? `/${d.uf}` : ""}</div>
                    </td>
                    <td className="px-5 py-3 text-mist">{d.carteira_id ? (nomeCarteira.get(d.carteira_id) ?? "—") : "—"}</td>
                    <td className="px-5 py-3 font-mono text-chalk tabnums">{brl(d.saldo)}</td>
                    <td className="px-5 py-3"><Badge tone={STATUS_TONE[d.status_cobranca] ?? "neutral"}>{d.status_cobranca.replace(/_/g, " ")}</Badge></td>
                    <td className="px-5 py-3">{resp ? <Badge tone={resp.tone}>{resp.label}</Badge> : <span className="text-mist">—</span>}</td>
                  </tr>
                );
              })}
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
            <Link href={`/devedores${qs({ pg: pagina - 1 })}`} className="rounded-lg border border-line px-3 py-1.5 text-mist hover:text-chalk">Anterior</Link>
          )}
          <span className="text-mist">Página {pagina} de {totalPag}</span>
          {pagina < totalPag && (
            <Link href={`/devedores${qs({ pg: pagina + 1 })}`} className="rounded-lg border border-line px-3 py-1.5 text-mist hover:text-chalk">Próxima</Link>
          )}
        </div>
      )}
    </>
  );
}
