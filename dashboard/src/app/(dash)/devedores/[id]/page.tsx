import { supabaseServer } from "@/lib/supabase-server";
import { Card, SectionTitle, Badge, Button } from "@/components/ui/primitives";
import { brl, dataBR, dataHoraBR } from "@/lib/utils";
import { ArrowLeft, ExternalLink, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DevedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();

  const { data: d } = await sb.from("devedores").select("*").eq("id", Number(id)).maybeSingle();
  if (!d) notFound();

  const [{ data: telefones }, { data: conversas }, { data: negociacoes }, { data: pagamentos }, { data: eventos }, { data: cfg }] =
    await Promise.all([
      sb.from("telefones_devedor").select("*").eq("devedor_id", d.id).order("ordem"),
      sb.from("conversas").select("*").eq("devedor_id", d.id).order("criado_em", { ascending: false }),
      sb.from("negociacoes").select("*").eq("devedor_id", d.id).order("criado_em", { ascending: false }),
      sb.from("pagamentos").select("*").eq("devedor_id", d.id).order("criado_em", { ascending: false }),
      sb.from("eventos_campanha").select("*").eq("devedor_id", d.id).order("criado_em", { ascending: false }).limit(20),
      sb.from("configuracoes").select("valor").eq("chave", "chatwoot").maybeSingle(),
    ]);

  const cwUrl = cfg?.valor?.url ?? "https://chatwoot.example.com";
  const conv = conversas?.[0];

  return (
    <>
      <Link href="/devedores" className="mb-4 inline-flex items-center gap-1.5 text-sm text-mist hover:text-chalk">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <SectionTitle
        title={d.nome}
        sub={`CPF ${d.cpf_cnpj} · Processo ${d.processo}`}
        action={conv && (
          <a href={`${cwUrl}/app/accounts/1/conversations/${conv.chatwoot_conversation_id}`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><ExternalLink className="h-4 w-4" /> Abrir conversa</Button>
          </a>
        )}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Dívida", brl(d.saldo)],
              ["Vencimento", dataBR(d.vencimento)],
              ["Cidade", `${d.cidade ?? "—"}${d.uf ? `, ${d.uf}` : ""}`],
              ["Status", d.status_cobranca.replace(/_/g, " ")],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-xs text-mist">{k}</div>
                <div className="mt-0.5 font-medium text-chalk">{v}</div>
              </div>
            ))}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-mist">Telefones</h4>
            <div className="flex flex-wrap gap-2">
              {(telefones ?? []).map((t) => (
                <Badge key={t.id} tone={t.whatsapp_valido === false ? "rose" : t.whatsapp_valido ? "green" : "neutral"}>
                  <Phone className="h-3 w-3" /> {t.telefone_e164}
                </Badge>
              ))}
            </div>
          </div>

          {(negociacoes ?? []).length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-mist">Negociações</h4>
              <div className="flex flex-col gap-2">
                {negociacoes!.map((n) => (
                  <div key={n.id} className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-3 py-2 text-sm">
                    <span className="text-mist">{n.desconto_pct}% off · válido {dataBR(n.validade)}</span>
                    <span className="font-mono text-chalk tabnums">{brl(n.valor_proposto)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(pagamentos ?? []).length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-mist">Pagamentos</h4>
              <div className="flex flex-col gap-2">
                {pagamentos!.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl border border-line bg-ink-850 px-3 py-2 text-sm">
                    <Badge tone={["recebido", "confirmado"].includes(p.status) ? "green" : "neutral"}>{p.status}</Badge>
                    <span className="font-mono text-chalk tabnums">{brl(p.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h4 className="mb-3 font-display text-base font-600 text-chalk">Linha do tempo</h4>
          <div className="flex flex-col gap-3">
            {(eventos ?? []).length === 0 && <p className="text-sm text-mist">Sem eventos ainda.</p>}
            {(eventos ?? []).map((e) => (
              <div key={e.id} className="flex gap-3">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald" />
                <div>
                  <div className="text-sm text-chalk">{e.tipo.replace(/_/g, " ")}</div>
                  <div className="text-[11px] text-mist">{dataHoraBR(e.criado_em)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
