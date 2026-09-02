import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirConversa, cobradorDoChip } from "@/lib/conversas";
import { canalDaConversa, type CanalConversa } from "@/lib/canal-conversa";
import {
  contaChatwoot, enviarTexto, enviarNota, enviarTemplate, renderizarModelo,
} from "@/lib/chatwoot-atendimento";

// Limite de corpo de mensagem da Cloud API. Cortar aqui evita um 400 da Meta depois de o
// Chatwoot já ter aceitado a requisição.
const MAX_CARACTERES = 4096;

type Envio = { ok: true; conteudo: string; chatwoot_message_id: number | null } | { ok: false; erro: string };

/** Traduz o resultado da Evolution para uma frase que o operador entende. */
function explicarEvolution(resultado: string | undefined, chipNome: string | null): string {
  switch (resultado) {
    case "sem_whatsapp":
      return "O WhatsApp respondeu que este número não existe. Confira o cadastro do devedor.";
    case "chip_caido":
      return `A sessão do número ${chipNome ?? "do chip"} caiu. Reconecte por QR na tela de Chips antes de responder.`;
    case "retentar":
      return "A Evolution está limitando o envio agora. Tente de novo em alguns instantes.";
    default:
      return "A Evolution não conseguiu entregar a mensagem. Confira a conexão do número.";
  }
}

/**
 * Saída pelo Baileys: direto na Evolution, via Edge Function `enviar-mensagem`.
 *
 * É ela que aplica presença e "digitando…" — os sinais comportamentais pelos quais o WhatsApp
 * separa humano de robô (ADR-0002). Como o endereço é o TELEFONE e não o ponteiro do Chatwoot,
 * este caminho também funciona nas conversas que ficaram apontando para a inbox do número banido.
 * O espelho de volta vem sozinho: a Evolution publica no Chatwoot, o webhook chega ao
 * `chatwoot-sync` e ele reconcilia esta linha pelo conteúdo.
 */
async function enviarPelaEvolution(canal: CanalConversa, conteudo: string, simulacao: boolean): Promise<Envio> {
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/enviar-mensagem`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chip_id: canal.chip?.id,
      numero_e164: canal.telefone_e164,
      texto: conteudo,
      simulacao,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d?.ok) return { ok: false, erro: explicarEvolution(d?.resultado ?? d?.erro, canal.chip?.nome ?? null) };
  return { ok: true, conteudo, chatwoot_message_id: null };
}

/**
 * POST — o operador responde pela caixa de entrada do painel.
 *
 * body: { conteudo?, privado?, modelo?: { name, language, params[] } }
 *
 * O caminho de saída depende do CONECTOR do chip (ver `canalDaConversa`):
 *   • baileys    → Evolution, texto livre sempre, sem janela e sem modelo
 *   • meta_cloud → Chatwoot (inbox whatsapp_cloud) → Meta, com janela de 24h e modelo aprovado
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

  // Guardas de conteúdo antes de qualquer chamada externa.
  if (!modeloPedido && !conteudo) return NextResponse.json({ erro: "Escreva a mensagem." }, { status: 400 });
  if (conteudo.length > MAX_CARACTERES) {
    return NextResponse.json({ erro: `Mensagem longa demais (máx. ${MAX_CARACTERES} caracteres).` }, { status: 400 });
  }

  const canal = await canalDaConversa(conversa);
  const admin = supabaseAdmin();
  const agora = new Date().toISOString();

  // ── Nota interna: nunca sai para o contato, não pausa o robô, não mexe no estado ──────────
  // Vai ao Chatwoot quando há ponteiro válido, para a equipe ver dos dois lados. Sem ponteiro, ela
  // ainda assim é gravada aqui — perder a anotação porque a inbox antiga morreu seria gratuito.
  if (privado) {
    let chatwootMessageId: number | null = null;
    if (canal.ponteiro_valido && conversa.chatwoot_conversation_id) {
      const conta = await contaChatwoot();
      if (conta) {
        const r = await enviarNota(conta, conversa.chatwoot_conversation_id, conteudo);
        if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
        chatwootMessageId = r.chatwoot_message_id;
      }
    }

    const { data: msg, error } = await admin.from("mensagens").insert({
      conversa_id: conversa.id,
      direcao: "saida",
      origem: "humano",
      conteudo,
      privado: true,
      autor_id: sessao.user.id,
      autor_nome: nome,
      chip_id: canal.chip?.id ?? null,
      // O Chatwoot não espelha nota interna de volta (o chatwoot-sync as ignora), então este é o
      // único registro dela. Guardar o id mantém a linha idempotente se isso mudar um dia.
      chatwoot_message_id: chatwootMessageId,
      simulacao: conversa.simulacao,
      criado_em: agora,
    }).select("id").single();
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, mensagem_id: msg.id, privado: true, conteudo });
  }

  // ── Mensagem para o contato ───────────────────────────────────────────────────────────────
  // `impedimento` já cobre opt-out, bloqueio permanente de contato (ADR-0003), pessoa errada,
  // chip ausente e ponteiro morto. É limite duro: 409 e nada sai.
  if (canal.caminho === "nenhum") {
    return NextResponse.json(
      { erro: canal.impedimento ?? "Esta conversa não aceita mensagem.", motivo: "sem_caminho" },
      { status: 409 },
    );
  }

  let envio: Envio;

  if (canal.caminho === "evolution") {
    if (modeloPedido) {
      return NextResponse.json(
        { erro: "Modelo aprovado é coisa do canal da Meta. Neste número, escreva o texto." },
        { status: 400 },
      );
    }
    envio = await enviarPelaEvolution(canal, conteudo, conversa.simulacao);
  } else {
    const conta = await contaChatwoot();
    if (!conta) {
      return NextResponse.json({ erro: "Chatwoot não configurado (URL em Ajustes e chave CHATWOOT_TOKEN)." }, { status: 400 });
    }
    const convCw = conversa.chatwoot_conversation_id!;

    if (modeloPedido) {
      const cobrador = await cobradorDoChip(conversa.chip_id);
      const r = await renderizarModelo(cobrador, modeloPedido);
      if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
      const t = await enviarTemplate(conta, convCw, r.tpl);
      envio = t.ok
        ? { ok: true, conteudo: t.conteudo, chatwoot_message_id: t.chatwoot_message_id }
        : { ok: false, erro: t.erro };
    } else {
      // Fora da janela de 24h a Cloud API recusa texto livre (erro 131047). Barrar aqui dá um erro
      // legível em vez de uma falha crua da Meta rebatida pelo Chatwoot. Só vale neste canal: na
      // Baileys não existe janela, e aplicar a regra lá barrava resposta que podia sair.
      if (!canal.texto_livre) {
        return NextResponse.json(
          {
            erro: "A janela de 24h desta conversa fechou. Fora dela o WhatsApp só entrega modelo aprovado pela Meta.",
            motivo: "fora_da_janela",
          },
          { status: 409 },
        );
      }
      const t = await enviarTexto(conta, convCw, conteudo);
      envio = t.ok
        ? { ok: true, conteudo: t.conteudo, chatwoot_message_id: t.chatwoot_message_id }
        : { ok: false, erro: t.erro };
    }
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
    // Congela o transporte: reatribuição de chip não pode reescrever quem mandou (§38).
    chip_id: canal.chip?.id ?? null,
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
