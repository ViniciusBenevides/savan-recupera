import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarCarteira, erroDono, type Sessao } from "@/lib/auth";

export type ConversaAtendimento = {
  id: number;
  carteira_id: number | null;
  devedor_id: number;
  chip_id: number | null;
  chatwoot_conversation_id: number | null;
  /** Inbox onde o ponteiro do Chatwoot vive. Diferente da inbox do chip = ponteiro obsoleto. */
  chatwoot_inbox_id: number | null;
  telefone_id: number | null;
  estado: string;
  motivo_encerramento: string | null;
  simulacao: boolean;
  ultima_entrada_em: string | null;
  atendente_id: string | null;
  atendente_nome: string | null;
};

const CAMPOS =
  "id, carteira_id, devedor_id, chip_id, chatwoot_conversation_id, chatwoot_inbox_id, telefone_id, estado, motivo_encerramento, simulacao, ultima_entrada_em, atendente_id, atendente_nome";

// Estados que não voltam atrás: a conversa já teve desfecho e nada deve reabri-la por acidente.
// `optout` é o mais sério — a pessoa pediu para não ser contatada e insistir tem custo legal.
export const ESTADOS_TERMINAIS = ["pago", "optout", "encerrada"] as const;

export type GuardaConversa =
  | { erro: NextResponse; conversa?: undefined; sessao?: undefined; nome?: undefined }
  | { erro?: undefined; conversa: ConversaAtendimento; sessao: Sessao; nome: string };

/**
 * Autoriza uma ação de atendimento sobre a conversa: precisa ser admin ou o cobrador dono da
 * carteira. Devolve também o nome de exibição do operador — todo envio humano fica assinado.
 */
export async function exigirConversa(id: unknown): Promise<GuardaConversa> {
  const convId = Number(id);
  if (!Number.isInteger(convId) || convId <= 0) {
    return { erro: NextResponse.json({ erro: "conversa_invalida" }, { status: 400 }) };
  }
  const g = await exigirCobrador();
  if (g.erro) return { erro: g.erro };
  const { sessao } = g;

  const admin = supabaseAdmin();
  const { data: conversa } = await admin.from("conversas").select(CAMPOS).eq("id", convId).maybeSingle();
  if (!conversa) return { erro: NextResponse.json({ erro: "conversa_nao_encontrada" }, { status: 404 }) };

  if (conversa.carteira_id == null) {
    if (sessao.role !== "admin") return { erro: erroDono() };
  } else if (!(await podeEditarCarteira(sessao, conversa.carteira_id))) {
    return { erro: erroDono() };
  }

  const { data: perfil } = await admin.from("usuarios_app").select("nome").eq("id", sessao.user.id).maybeSingle();
  const nome = perfil?.nome ?? sessao.user.email ?? "operador";

  return { conversa: conversa as ConversaAtendimento, sessao, nome };
}

/** Dono do chip que conversa — define quais modelos aprovados da Meta estão no escopo. */
export async function cobradorDoChip(chipId: number | null): Promise<string | null> {
  if (!chipId) return null;
  const { data } = await supabaseAdmin().from("chips").select("cobrador_id").eq("id", chipId).maybeSingle();
  return (data?.cobrador_id as string | null) ?? null;
}
