import { supabaseServer } from "@/lib/supabase-server";
import { Inbox } from "./inbox";

const TAMANHO_PAGINA = 1000;
const TAMANHO_LOTE = 100;

function emLotes<T>(itens: T[], tamanho = TAMANHO_LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/** Aba "Todas" — a caixa de entrada das conversas do robô. */
export async function Dialogos() {
  const sb = await supabaseServer();

  // Lista COMPLETA de conversas (mais recentes primeiro). A Data API limita o tamanho
  // de cada resposta, então percorremos todas as páginas em vez de exibir um total parcial.
  // Conversas sem mensagem ainda (ultima_msg_em nula) caem no fim.
  const convs: any[] = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await sb
      .from("conversas")
      .select("id, devedor_id, carteira_id, chip_id, estado, motivo_encerramento, simulacao, ultima_msg_em, ultima_msg_de, chatwoot_conversation_id, criado_em")
      .order("ultima_msg_em", { ascending: false, nullsFirst: false })
      .range(inicio, inicio + TAMANHO_PAGINA - 1);

    if (error) throw new Error(`Falha ao carregar conversas: ${error.message}`);
    const pagina = data ?? [];
    convs.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) break;
  }

  const lista0 = convs;
  const devIds = [...new Set(lista0.map((c) => c.devedor_id).filter(Boolean))];
  const cartIds = [...new Set(lista0.map((c) => c.carteira_id).filter(Boolean))];
  const chipIds = [...new Set(lista0.map((c) => c.chip_id).filter(Boolean))];
  const convIds = lista0.map((c) => c.id);

  // Os relacionamentos também são consultados em lotes. Isso evita URLs enormes no `.in()`
  // e garante que aumentar o histórico não volte a truncar nomes, carteiras ou prévias.
  const [devResultados, cartResultados, chipResultados, msgResultados, { data: cfg, error: cfgErro }] = await Promise.all([
    Promise.all(emLotes(devIds).map((ids) =>
      sb.from("devedores").select("id, nome, cpf_cnpj, saldo, status_cobranca, cidade, uf").in("id", ids),
    )),
    Promise.all(emLotes(cartIds).map((ids) =>
      sb.from("carteiras").select("id, nome").in("id", ids),
    )),
    Promise.all(emLotes(chipIds).map((ids) =>
      sb.from("chips").select("id, nome, numero_e164, papel").in("id", ids),
    )),
    Promise.all(emLotes(convIds).map((ids) =>
      sb.from("mensagens")
        .select("conversa_id, conteudo, criado_em, origem")
        .in("conversa_id", ids)
        .order("criado_em", { ascending: false })
        .limit(4000),
    )),
    sb.from("configuracoes").select("valor").eq("chave", "chatwoot").is("cobrador_id", null).maybeSingle(),
  ]);

  const resultados = [...devResultados, ...cartResultados, ...chipResultados, ...msgResultados];
  const erroRelacionado = resultados.find((r) => r.error)?.error ?? cfgErro;
  if (erroRelacionado) throw new Error(`Falha ao carregar dados das conversas: ${erroRelacionado.message}`);

  const devs = devResultados.flatMap((r) => r.data ?? []);
  const carts = cartResultados.flatMap((r) => r.data ?? []);
  const chipsRaw = chipResultados.flatMap((r) => r.data ?? []);
  const msgs = msgResultados.flatMap((r) => r.data ?? []);

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
      motivo_encerramento: (c.motivo_encerramento as string | null) ?? null,
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
