import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirConversa } from "@/lib/conversas";
import { contaChatwoot, alternarStatus } from "@/lib/chatwoot-atendimento";

const ACOES = ["assumir", "devolver_ao_robo", "resolver", "reabrir", "marcar_lida"] as const;
type Acao = (typeof ACOES)[number];

/**
 * PATCH — controles de atendimento da conversa. body: { acao }
 *
 * `assumir` / `devolver_ao_robo` é a chave do convívio entre robô e humano: bot-turno só se cala
 * quando `estado = humano`. Sem isso o robô responde por cima do operador.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirConversa(id);
  if (g.erro) return g.erro;
  const { conversa, sessao, nome } = g;

  const body = await req.json().catch(() => ({}));
  const acao = String(body?.acao ?? "") as Acao;
  if (!ACOES.includes(acao)) return NextResponse.json({ erro: "acao_invalida" }, { status: 400 });

  const admin = supabaseAdmin();
  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  let statusChatwoot: "open" | "resolved" | null = null;

  if (acao === "marcar_lida") {
    patch.lida_em = agora;
  }

  if (acao === "assumir") {
    if (["pago", "optout"].includes(conversa.estado)) {
      return NextResponse.json({ erro: "Esta conversa já teve desfecho e não pode ser reaberta assim." }, { status: 409 });
    }
    patch.estado = "humano";
    patch.atendente_id = sessao.user.id;
    patch.atendente_nome = nome;
    patch.assumida_em = agora;
    patch.proximo_followup_em = null;
    patch.lida_em = agora;
    statusChatwoot = "open";
  }

  if (acao === "devolver_ao_robo") {
    if (conversa.estado !== "humano") {
      return NextResponse.json({ erro: "Esta conversa não está com atendimento humano." }, { status: 409 });
    }
    // Volta como `bot_ativo`: a conversa já tem histórico, então não é mais uma abordagem
    // aguardando primeira resposta. bot-turno assume daqui na próxima mensagem do contato.
    patch.estado = "bot_ativo";
    patch.atendente_id = null;
    patch.atendente_nome = null;
    patch.assumida_em = null;
    statusChatwoot = "open";
  }

  if (acao === "resolver") {
    if (["pago", "optout"].includes(conversa.estado)) {
      return NextResponse.json({ erro: "Esta conversa já tem um desfecho registrado." }, { status: 409 });
    }
    patch.estado = "encerrada";
    // O gatilho trg_classificar_motivo_encerramento preenche `outro` se ninguém disser o motivo.
    patch.motivo_encerramento = "outro";
    patch.proximo_followup_em = null;
    patch.lida_em = agora;
    statusChatwoot = "resolved";
  }

  if (acao === "reabrir") {
    if (!["encerrada"].includes(conversa.estado)) {
      return NextResponse.json({ erro: "Só dá para reabrir uma conversa encerrada." }, { status: 409 });
    }
    patch.estado = "humano";
    patch.motivo_encerramento = null;
    patch.atendente_id = sessao.user.id;
    patch.atendente_nome = nome;
    patch.assumida_em = agora;
    patch.lida_em = agora;
    statusChatwoot = "open";
  }

  const { error } = await admin.from("conversas").update(patch).eq("id", conversa.id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  // Espelhar o status no Chatwoot é conveniência para quem também usa a tela de lá; a falha não
  // invalida a ação, que já está registrada no painel.
  if (statusChatwoot && conversa.chatwoot_conversation_id) {
    const conta = await contaChatwoot();
    if (conta) await alternarStatus(conta, conversa.chatwoot_conversation_id, statusChatwoot);
  }

  return NextResponse.json({ ok: true, acao, estado: patch.estado ?? conversa.estado });
}
