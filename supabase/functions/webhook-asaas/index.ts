// SAVAN Recupera — webhook-asaas
// Recebe eventos de cobrança do Asaas. SEMPRE responde 200 (senão a fila do Asaas pausa).
// Valida o token, atualiza o pagamento (o trigger PG propaga para devedor/conversa/métrica)
// e envia ao devedor a confirmação + termo de quitação via Chatwoot.
import { admin, carregarSegredos, getConfig, cwFromConfig, json, cors, renderTemplate } from "../_shared/lib.ts";

const MAP: Record<string, string> = {
  PAYMENT_RECEIVED: "recebido",
  PAYMENT_CONFIRMED: "confirmado",
  PAYMENT_OVERDUE: "vencido",
  PAYMENT_REFUNDED: "estornado",
  PAYMENT_DELETED: "cancelado",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = admin();
    await carregarSegredos(sb);
    const tokenEsperado = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
    const tokenRecebido = req.headers.get("asaas-access-token");
    if (tokenEsperado && tokenRecebido !== tokenEsperado) {
      // responde 200 mesmo assim para não travar a fila, mas não processa
      return json({ ok: false, motivo: "token_invalido" }, 200);
    }

    const evt = await req.json();
    const cfg = await getConfig(sb);
    const payment = evt?.payment;
    const novoStatus = MAP[evt?.event];
    if (!payment?.id || !novoStatus) return json({ ok: true, ignorado: true });

    const { data: pg } = await sb.from("pagamentos")
      .select("id, devedor_id, valor, comissao_operador, status")
      .eq("asaas_payment_id", payment.id).maybeSingle();
    if (!pg) return json({ ok: true, motivo: "pagamento_desconhecido" });

    // atualiza status (trigger fn_pagamento_confirmado propaga quando recebido/confirmado)
    await sb.from("pagamentos").update({
      status: novoStatus,
      valor_liquido: payment.netValue ?? null,
    }).eq("id", pg.id);

    // confirmação + termo apenas em recebido/confirmado
    if (novoStatus === "recebido" || novoStatus === "confirmado") {
      const { data: dev } = await sb.from("devedores")
        .select("id, nome, cpf_cnpj, processo").eq("id", pg.devedor_id).single();
      const { data: conv } = await sb.from("conversas")
        .select("chatwoot_conversation_id, chatwoot_contact_id")
        .eq("devedor_id", pg.devedor_id)
        .order("criado_em", { ascending: false }).limit(1).maybeSingle();

      const primeiroNome = (dev?.nome ?? "").split(" ")[0];
      const vars = {
        primeiro_nome: primeiroNome.charAt(0) + primeiroNome.slice(1).toLowerCase(),
        nome: dev?.nome,
        cpf: dev?.cpf_cnpj,
        processo: dev?.processo,
        valor_pago: pg.valor,
        data_pagamento: new Date().toLocaleDateString("pt-BR"),
      };

      if (conv?.chatwoot_conversation_id) {
        const cw = cwFromConfig(cfg);
        const { data: tConf } = await sb.from("templates_mensagem")
          .select("conteudo").eq("tipo", "confirmacao_pagamento").eq("ativo", true).limit(1).maybeSingle();
        const { data: tQuit } = await sb.from("templates_mensagem")
          .select("conteudo").eq("tipo", "quitacao").eq("ativo", true).limit(1).maybeSingle();
        if (tConf) await cw.enviarMensagem(conv.chatwoot_conversation_id, renderTemplate(tConf.conteudo, vars), 6);
        if (tQuit) await cw.enviarMensagem(conv.chatwoot_conversation_id, renderTemplate(tQuit.conteudo, vars), 6);
        await cw.addLabels(conv.chatwoot_conversation_id, ["pix-pago", "acordo"]);
        if (conv.chatwoot_contact_id) {
          await cw.atualizarContato(conv.chatwoot_contact_id, { asaas_status_cobranca: "Pago" });
        }
      }
    }

    return json({ ok: true });
  } catch (e) {
    // nunca derruba o webhook
    console.error("webhook-asaas erro:", e);
    return json({ ok: true, erro_interno: String(e) }, 200);
  }
});
