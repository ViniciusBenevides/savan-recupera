import { supabaseServer } from "@/lib/supabase-server";
import { SectionTitle } from "@/components/ui/primitives";
import { Inbox } from "./inbox";

export const dynamic = "force-dynamic";

export default async function ConversasPage() {
  const sb = await supabaseServer();

  // Lista de conversas (mais recentes primeiro). Conversas sem mensagem ainda
  // (ultima_msg_em nula) caem no fim.
  const { data: convs } = await sb
    .from("conversas")
    .select(
      "id, devedor_id, carteira_id, estado, simulacao, ultima_msg_em, ultima_msg_de, chatwoot_conversation_id, criado_em",
    )
    .order("ultima_msg_em", { ascending: false, nullsFirst: false })
    .limit(300);

  const lista0 = convs ?? [];
  const devIds = [...new Set(lista0.map((c) => c.devedor_id).filter(Boolean))];
  const cartIds = [...new Set(lista0.map((c) => c.carteira_id).filter(Boolean))];
  const convIds = lista0.map((c) => c.id);

  const [{ data: devs }, { data: carts }, { data: msgs }, { data: cfg }] = await Promise.all([
    devIds.length
      ? sb.from("devedores").select("id, nome, cpf_cnpj, saldo, status_cobranca, cidade, uf").in("id", devIds)
      : Promise.resolve({ data: [] as any[] }),
    cartIds.length
      ? sb.from("carteiras").select("id, nome").in("id", cartIds)
      : Promise.resolve({ data: [] as any[] }),
    convIds.length
      ? sb
          .from("mensagens")
          .select("conversa_id, conteudo, criado_em, origem")
          .in("conversa_id", convIds)
          .order("criado_em", { ascending: false })
          .limit(4000)
      : Promise.resolve({ data: [] as any[] }),
    sb.from("configuracoes").select("valor").eq("chave", "chatwoot").is("cobrador_id", null).maybeSingle(),
  ]);

  const devMap = new Map((devs ?? []).map((d: any) => [d.id, d]));
  const cartMap = new Map((carts ?? []).map((c: any) => [c.id, c.nome]));

  // Prévia = primeira mensagem encontrada por conversa (a query veio desc, então
  // a 1ª que aparece de cada conversa é a mais recente).
  const prev = new Map<number, { texto: string; origem: string }>();
  for (const m of (msgs ?? []) as any[]) {
    if (!prev.has(m.conversa_id)) prev.set(m.conversa_id, { texto: m.conteudo ?? "", origem: m.origem });
  }

  const lista = lista0.map((c) => {
    const d: any = devMap.get(c.devedor_id) ?? {};
    const p = prev.get(c.id);
    return {
      id: c.id,
      devedor_id: c.devedor_id,
      estado: c.estado as string,
      simulacao: !!c.simulacao,
      ultima_msg_em: c.ultima_msg_em as string | null,
      ultima_msg_de: c.ultima_msg_de as string | null,
      chatwoot_id: c.chatwoot_conversation_id as number | null,
      nome: (d.nome as string) ?? "Contato",
      cpf: (d.cpf_cnpj as string) ?? "",
      saldo: Number(d.saldo ?? 0),
      status_cobranca: (d.status_cobranca as string) ?? "",
      cidade: (d.cidade as string) ?? null,
      uf: (d.uf as string) ?? null,
      carteira: (cartMap.get(c.carteira_id) as string) ?? null,
      preview: p?.texto ?? null,
      preview_de: p?.origem ?? null,
    };
  });

  const cwUrl: string = cfg?.valor?.url ?? "";

  return (
    <>
      <SectionTitle
        title="Conversas"
        sub={`${lista.length} conversa${lista.length === 1 ? "" : "s"} · leia o histórico completo de cada contato.`}
      />
      <Inbox lista={lista} cwUrl={cwUrl} />
    </>
  );
}
