// SAVAN Recupera — contato-criar
// Valida o número no WhatsApp (on_whatsapp), busca/cria contato e conversa no Chatwoot.
// Espelha o workflow de referência "10. Buscar ou criar contato + conversa".
// Entrada: { inbox_id, telefone_e164, devedor_id, devedor_nome, processo, valor_divida }
// Saída:   { ok, exists, conversation_id, contact_id, jid_e164 }
import { admin, carregarSegredos, getConfig, cwFromConfig, json, cors } from "../_shared/lib.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();
  await carregarSegredos(sb);
  const cfg = await getConfig(sb);
  const cw = cwFromConfig(cfg);
  const body = await req.json();

  const { inbox_id, telefone_e164, devedor_id, devedor_nome, processo, valor_divida } = body;
  if (!inbox_id) return json({ ok: false, erro: "inbox_id_ausente" }, 400);

  // 1) valida no WhatsApp
  const wpp = await cw.onWhatsapp(inbox_id, telefone_e164);
  if (!wpp?.exists) {
    if (body.telefone_id) {
      await sb.from("telefones_devedor")
        .update({ whatsapp_valido: false, verificado_em: new Date().toISOString() })
        .eq("id", body.telefone_id);
    }
    return json({ ok: true, exists: false });
  }

  // número canônico vindo do jid (fonte de verdade do 9º dígito)
  let jidE164 = telefone_e164;
  const jid: string = wpp.jid ?? "";
  const mJid = jid.match(/^(\d+)@/);
  if (mJid) jidE164 = "+" + mJid[1];

  if (body.telefone_id) {
    await sb.from("telefones_devedor")
      .update({ whatsapp_valido: true, verificado_em: new Date().toISOString() })
      .eq("id", body.telefone_id);
  }

  // 2) busca contato existente
  let contato: any = null;
  for (const q of [jidE164, jidE164.replace("+", ""), telefone_e164]) {
    const achados = await cw.buscarContato(q);
    if (achados.length) { contato = achados[0]; break; }
  }

  const attrs = {
    devedor_id,
    processo,
    valor_divida,
  };

  // 3) cria se não existe
  if (!contato) {
    contato = await cw.criarContato(inbox_id, jidE164, devedor_nome ?? "Cliente", attrs);
  } else {
    await cw.atualizarContato(contato.id, attrs);
  }
  const contactId = contato?.id;
  if (devedor_id && contactId) {
    await sb.from("devedores").update({ chatwoot_contact_id: contactId }).eq("id", devedor_id);
  }

  // 4) source_id do inbox (necessário para criar conversa no canal Z-API)
  let sourceId = jidE164.replace("+", "");
  const ci = contato?.contact_inboxes?.find((x: any) => x.inbox?.id === inbox_id);
  if (ci?.source_id) sourceId = ci.source_id;

  // 5) cria conversa
  const conv = await cw.criarConversa(inbox_id, contactId, sourceId);
  const conversationId = conv?.id;

  return json({
    ok: true,
    exists: true,
    contact_id: contactId,
    conversation_id: conversationId,
    jid_e164: jidE164,
  });
});
