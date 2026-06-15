// SAVAN Recupera — campanha-registrar
// Chamada pelo W01 depois de enviar (ou simular) cada item.
// Atualiza a fila, cria a conversa no Supabase, incrementa métricas e registra evento.
// Entrada: { fila_id, chip_id, devedor_id, telefone_id, status: 'enviado'|'falha'|'sem_whatsapp',
//            chatwoot_conversation_id?, chatwoot_contact_id?, erro? }
import { admin, carregarSegredos, getConfig, json, cors } from "../_shared/lib.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();
  await carregarSegredos(sb);
  const cfg = await getConfig(sb);
  const b = await req.json();
  const hoje = new Date().toISOString().slice(0, 10);

  if (b.status === "enviado") {
    await sb.from("fila_envios").update({
      status: "enviado",
      enviado_em: new Date().toISOString(),
      chatwoot_conversation_id: b.chatwoot_conversation_id ?? null,
    }).eq("id", b.fila_id);

    // primeiro follow-up agendado
    const horas = (cfg.followup?.intervalos_horas ?? [24, 72, 168])[0];
    const prox = new Date(Date.now() + horas * 3600 * 1000).toISOString();

    if (b.chatwoot_conversation_id) {
      await sb.from("conversas").upsert({
        devedor_id: b.devedor_id,
        chip_id: b.chip_id,
        telefone_id: b.telefone_id,
        chatwoot_conversation_id: b.chatwoot_conversation_id,
        chatwoot_contact_id: b.chatwoot_contact_id ?? null,
        estado: "aguardando_resposta",
        ultima_msg_em: new Date().toISOString(),
        ultima_msg_de: "bot",
        proximo_followup_em: prox,
      }, { onConflict: "chatwoot_conversation_id" });
    }

    await sb.from("devedores").update({ status_cobranca: "contatado" })
      .eq("id", b.devedor_id).eq("status_cobranca", "na_fila");

    await sb.rpc("fn_inc_chip_metrica", {
      p_chip: b.chip_id, p_dia: hoje, p_novos: 1, p_msgs: 1, p_resp: 0,
    });

    await sb.from("chips").update({ ultimo_envio_em: new Date().toISOString() })
      .eq("id", b.chip_id);

    await sb.from("eventos_campanha").insert({
      tipo: "envio", devedor_id: b.devedor_id, chip_id: b.chip_id,
      payload: { simulacao: b.simulacao ?? false },
    });

    await sb.rpc("fn_inc_metrica_dia", { p_dia: hoje, p_campo: "enviados", p_n: 1 });
  } else if (b.status === "sem_whatsapp") {
    await sb.from("fila_envios").update({ status: "sem_whatsapp", erro: b.erro ?? "on_whatsapp_false" })
      .eq("id", b.fila_id);
    // tenta próximo telefone do devedor
    const { data: prox } = await sb.rpc("fn_proximo_telefone", {
      p_devedor_id: b.devedor_id, p_excluir: b.telefone_id,
    });
    if (prox && prox.length) {
      await sb.from("fila_envios").insert({
        devedor_id: b.devedor_id, telefone_id: prox[0].id,
        prioridade: b.prioridade ?? 0, status: "aguardando",
      });
    } else {
      await sb.from("devedores").update({ status_cobranca: "sem_whatsapp" })
        .eq("id", b.devedor_id);
    }
  } else {
    await sb.from("fila_envios").update({
      status: "falha", erro: b.erro ?? "erro_envio", tentativas: (b.tentativas ?? 0) + 1,
    }).eq("id", b.fila_id);
    await sb.rpc("fn_inc_metrica_dia", { p_dia: hoje, p_campo: "falhas", p_n: 1 });
  }

  return json({ ok: true });
});
