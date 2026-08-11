import { supabaseServer } from "@/lib/supabase-server";
import { Inbox } from "./inbox";

/** Aba "Todas" — a caixa de entrada das conversas do robô. */
export async function Dialogos() {
  const sb = await supabaseServer();

  // Lista de conversas (mais recentes primeiro). Conversas sem mensagem ainda
  // (ultima_msg_em nula) caem no fim.
  const { data: convs } = await sb
    .from("conversas")
    .select("id, devedor_id, carteira_id, chip_id, estado, simulacao, ultima_msg_em, ultima_msg_de, chatwoot_conversation_id, criado_em")
    .order("ultima_msg_em", { ascending: false, nullsFirst: false })
    .limit(300);

  const lista0 = convs ?? [];
  const devIds = [...new Set(lista0.map((c) => c.devedor_id).filter(Boolean))];
  const cartIds = [...new Set(lista0.map((c) => c.carteira_id).filter(Boolean))];
  const chipIds = [...new Set(lista0.map((c) => c.chip_id).filter(Boolean))];
  const convIds = lista0.map((c) => c.id);

  const [{ data: devs }, { data: carts }, { data: chipsRaw }, { data: msgs }, { data: cfg }] = await Promise.all([
    devIds.length
      ? sb.from("devedores").select("id, nome, cpf_cnpj, saldo, status_cobranca, cidade, uf").in("id", devIds)
      : Promise.resolve({ data: [] as any[] }),
    cartIds.length
      ? sb.from("carteiras").select("id, nome").in("id", cartIds)
      : Promise.resolve({ data: [] as any[] }),
    chipIds.length
      ? sb.from("chips").select("id, nome, numero_e164, papel").in("id", chipIds)
      : Promise.resolve({ data: [] as any[] }),
    convIds.length
      ? sb.from("mensagens")
          .select("conversa_id, conteudo, criado_em, origem")
          .in("conversa_id", convIds)
          .order("criado_em", { ascending: false })
          .limit(4000)
      : Promise.resolve({ data: [] as any[] }),
    sb.from("configuracoes").select("valor").eq("chave", "chatwoot").is("cobrador_id", null).maybeSingle(),
  ]);

  const devMap = new Map((devs ?? []).map((d: any) => [d.id, d]));
  const cartMap = new Map((carts ?? []).map((c: any) => [c.id, c.nome]));
  const chipMap = new Map((chipsRaw ?? []).map((c: any) => [c.id, c]));

  // Prévia = primeira mensagem encontrada por conversa (a query veio desc, então
  // a 1ª que aparece de cada conversa é a mais recente).
  const prev = new Map<number, { texto: string; origem: string }>();
  for (const m of (msgs ?? []) as any[]) {
    if (!prev.has(m.conversa_id)) prev.set(m.conversa_id, { texto: m.conteudo ?? "", origem: m.origem });
  }

  const lista = lista0.map((c) => {
    const d: any = devMap.get(c.devedor_id) ?? {};
    const ch: any = chipMap.get(c.chip_id) ?? {};
    const p = prev.get(c.id);
    return {
      id: c.id,
      devedor_id: c.devedor_id,
      estado: c.estado as string,
      simulacao: !!c.simulacao,
      ultima_msg_em: c.ultima_msg_em as string | null,
      ultima_msg_de: c.ultima_msg_de as string | null,
      chatwoot_id: c.chatwoot_conversation_id as number | null,
      chip_id: (c.chip_id as number | null) ?? null,
      chip_nome: (ch.nome as string) ?? null,
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

  // Números que aparecem na caixa de entrada (só os do robô — o chip de escalador
  // humano não conversa por aqui). Ordenados por atividade: quem falou por último vem antes.
  const ordemChip = new Map<number, number>();
  lista.forEach((c, i) => {
    if (c.chip_id != null && !ordemChip.has(c.chip_id)) ordemChip.set(c.chip_id, i);
  });
  const chips = [...ordemChip.keys()]
    .map((id) => chipMap.get(id))
    .filter((c: any) => c && (c.papel ?? "bot") === "bot")
    .map((c: any) => ({ id: c.id as number, nome: c.nome as string, numero: (c.numero_e164 as string) ?? null }));

  // Padrão pedido: a caixa abre no número oficial que está conversando AGORA — o chip
  // com a conversa mais recente. Com um chip só (o caso normal) é sempre ele.
  const chipPadrao = chips.length ? chips[0].id : null;

  return <Inbox lista={lista} chips={chips} chipPadrao={chipPadrao} cwUrl={(cfg?.valor as any)?.url ?? ""} />;
}
