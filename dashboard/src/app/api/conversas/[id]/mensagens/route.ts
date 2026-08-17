import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirConversa, cobradorDoChip } from "@/lib/conversas";
import {
  contaChatwoot, enviarTexto, enviarNota, enviarTemplate,
  renderizarModelo, dentroDaJanela,
} from "@/lib/chatwoot-atendimento";

// Limite de corpo de mensagem da Cloud API. Cortar aqui evita um 400 da Meta depois de o
// Chatwoot já ter aceitado a requisição.
const MAX_CARACTERES = 4096;

/**
 * POST — o operador responde pela caixa de entrada do painel.
 *
 * body: { conteudo?, privado?, modelo?: { name, language, params[] } }
 *
 * Caminho da mensagem: painel → Chatwoot (inbox whatsapp_cloud) → Meta → contato. Gravamos a
 * cópia local com o `chatwoot_message_id` devolvido; quando o webhook do Chatwoot chegar pelo
 * n8n, o chatwoot-sync encontra a linha por esse id e atualiza em vez de duplicar.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirConversa(id);
  if (g.erro) return g.erro;
  const { conversa, sessao, nome } = g;

  const body = await req.json().catch(() => ({}));
  const privado = body?.privado === true;
  const conteudo = String(body?.conteudo ?? "").trim();
  const modeloPedido = body?.modelo ?? null;

  if (!conversa.chatwoot_conversation_id) {
    return NextResponse.json(
      { erro: "Esta conversa ainda não está ligada ao Chatwoot — não há por onde enviar." },
      { status: 400 },
    );
  }

  // Guardas de conteúdo antes de qualquer chamada externa.
  if (!modeloPedido && !conteudo) return NextResponse.json({ erro: "Escreva a mensagem." }, { status: 400 });
  if (conteudo.length > MAX_CARACTERES) {
    return NextResponse.json({ erro: `Mensagem longa demais (máx. ${MAX_CARACTERES} caracteres).` }, { status: 400 });
  }

  const conta = await contaChatwoot();
  if (!conta) {
    return NextResponse.json({ erro: "Chatwoot não configurado (URL em Ajustes e chave CHATWOOT_TOKEN)." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const agora = new Date().toISOString();

  // ── Nota interna: nunca sai para o contato, não pausa o robô, não mexe no estado ──────────
  if (privado) {
    const r = await enviarNota(conta, conversa.chatwoot_conversation_id, conteudo);
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });

    const { data: msg, error } = await admin.from("mensagens").insert({
      conversa_id: conversa.id,
      direcao: "saida",
      origem: "humano",
      conteudo: r.conteudo,
      privado: true,
      autor_id: sessao.user.id,
      autor_nome: nome,
      // O Chatwoot não espelha nota interna de volta (o chatwoot-sync as ignora), então este é o
      // único registro dela. Guardar o id mantém a linha idempotente se isso mudar um dia.
      chatwoot_message_id: r.chatwoot_message_id,
      simulacao: conversa.simulacao,
      criado_em: agora,
    }).select("id").single();
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, mensagem_id: msg.id, privado: true, conteudo: r.conteudo });
  }

  // ── Mensagem para o contato ───────────────────────────────────────────────────────────────
  // Opt-out é limite duro: a pessoa pediu para não ser contatada.
  if (conversa.estado === "optout") {
    return NextResponse.json(
      { erro: "Esta pessoa pediu para não ser mais contatada. Não é possível enviar mensagem." },
      { status: 409 },
    );
  }
  if (conversa.estado === "encerrada" && conversa.motivo_encerramento === "pessoa_errada") {
    return NextResponse.json(
      { erro: "Este número foi marcado como de outra pessoa. Corrija o cadastro antes de escrever." },
      { status: 409 },
    );
  }

  const naJanela = dentroDaJanela(conversa.ultima_entrada_em);
  let envio;

  if (modeloPedido) {
    const cobrador = await cobradorDoChip(conversa.chip_id);
    const r = await renderizarModelo(cobrador, modeloPedido);
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
    envio = await enviarTemplate(conta, conversa.chatwoot_conversation_id, r.tpl);
  } else {
    // Fora da janela de 24h a Cloud API recusa texto livre (erro 131047). Barrar aqui dá um erro
    // legível em vez de uma falha crua da Meta rebatida pelo Chatwoot.
    if (!naJanela) {
      return NextResponse.json(
        {
          erro: "A janela de 24h desta conversa fechou. Fora dela o WhatsApp só entrega modelo aprovado pela Meta.",
          motivo: "fora_da_janela",
        },
        { status: 409 },
      );
    }
    envio = await enviarTexto(conta, conversa.chatwoot_conversation_id, conteudo);
  }

  if (!envio.ok) return NextResponse.json({ erro: envio.erro }, { status: 400 });

  const { data: msg, error } = await admin.from("mensagens").insert({
    conversa_id: conversa.id,
    direcao: "saida",
    origem: "humano",
    conteudo: envio.conteudo,
    privado: false,
    autor_id: sessao.user.id,
    autor_nome: nome,
    chatwoot_message_id: envio.chatwoot_message_id,
    simulacao: conversa.simulacao,
    criado_em: agora,
  }).select("id").single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  // Responder é assumir. Se o robô continuasse ativo ele responderia por cima do operador na
  // próxima mensagem do contato — bot-turno para justamente em `estado = humano`.
  const assumiu = !["pago", "optout", "encerrada"].includes(conversa.estado);
  const patch: Record<string, unknown> = {
    ultima_msg_em: agora,
    ultima_msg_de: "humano",
    lida_em: agora,
  };
  if (assumiu) {
    patch.estado = "humano";
    patch.proximo_followup_em = null;
    if (!conversa.atendente_id) {
      patch.atendente_id = sessao.user.id;
      patch.atendente_nome = nome;
      patch.assumida_em = agora;
    }
  }
  const { error: erroConv } = await admin.from("conversas").update(patch).eq("id", conversa.id);
  if (erroConv) return NextResponse.json({ erro: erroConv.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    mensagem_id: msg.id,
    conteudo: envio.conteudo,
    assumiu,
    estado: assumiu ? "humano" : conversa.estado,
  });
}
