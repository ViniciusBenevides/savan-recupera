// SAVAN Recupera — campanha-lote
// Chamada pelo W01 (n8n). Aplica gates de config, calcula o lote permitido por chip
// (aquecimento + pacing distribuído na janela), seleciona itens da fila atomicamente
// e devolve cada item já com a mensagem renderizada, pronto para o n8n enviar.
import {
  admin, carregarSegredos, getConfig, json, cors, escolherTemplate, renderTemplate,
  dentroDaJanela, minutosRestantesJanela,
} from "../_shared/lib.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();
  await carregarSegredos(sb);
  const cfg = await getConfig(sb);

  // reabre itens presos
  await sb.rpc("fn_resetar_presos", { p_min: 15 });

  const ativa = cfg.campanha_ativa === true || cfg.campanha_ativa === "true";
  if (!ativa) return json({ ok: true, motivo: "campanha_inativa", itens: [] });
  if (!dentroDaJanela(cfg.janela_envio)) {
    return json({ ok: true, motivo: "fora_da_janela", itens: [] });
  }

  const intervalo = Number(cfg.intervalo_min_segundos ?? 12);
  const simulacao = cfg.modo_simulacao === true || cfg.modo_simulacao === "true";
  const restanteJanela = minutosRestantesJanela(cfg.janela_envio);

  // chips elegíveis
  const { data: chips } = await sb
    .from("chips")
    .select("id, nome, chatwoot_inbox_id, status")
    .in("status", ["ativo", "aquecendo"]);

  const itens: any[] = [];

  for (const chip of chips ?? []) {
    const { data: limite } = await sb.rpc("fn_limite_chip", { p_chip_id: chip.id });
    const { data: mDia } = await sb
      .from("chip_metricas_diarias")
      .select("novos_contatos")
      .eq("chip_id", chip.id)
      .eq("dia", new Date().toISOString().slice(0, 10))
      .maybeSingle();
    const usados = mDia?.novos_contatos ?? 0;
    const restante = Math.max(0, (limite ?? 0) - usados);
    if (restante <= 0) continue;

    // pacing: espalha o restante pela janela; teto por minuto = 60/intervalo
    const porMinuto = Math.floor(60 / intervalo);
    const lote = Math.min(porMinuto, Math.ceil((restante / restanteJanela) * 1.2));
    if (lote <= 0) continue;

    const { data: selec } = await sb.rpc("fn_selecionar_lote", {
      p_chip_id: chip.id,
      p_n: lote,
    });

    for (const item of selec ?? []) {
      // dados do devedor + telefone
      const { data: dev } = await sb
        .from("devedores")
        .select("id, nome, processo, saldo, vencimento, chatwoot_contact_id")
        .eq("id", item.devedor_id)
        .single();
      const { data: tel } = await sb
        .from("telefones_devedor")
        .select("id, telefone_e164")
        .eq("id", item.telefone_id)
        .maybeSingle();

      if (!tel) {
        await sb.from("fila_envios").update({ status: "sem_whatsapp", erro: "sem_telefone" })
          .eq("id", item.id);
        continue;
      }

      const tpl = await escolherTemplate(sb, "abordagem_inicial");
      const primeiroNome = (dev?.nome ?? "").split(" ")[0];
      const primeiroNomeCap = primeiroNome.charAt(0) + primeiroNome.slice(1).toLowerCase();
      const conteudo = tpl
        ? renderTemplate(tpl.conteudo, {
          primeiro_nome: primeiroNomeCap,
          nome_bot: cfg.ia?.nome_bot ?? "Ana",
          nome: dev?.nome,
        })
        : `Olá ${primeiroNomeCap}, aqui é a ${cfg.ia?.nome_bot ?? "Ana"} da nossa loja de calçados.`;

      await sb.from("fila_envios")
        .update({ template_id: tpl?.id ?? null, mensagem_renderizada: conteudo })
        .eq("id", item.id);

      itens.push({
        fila_id: item.id,
        chip_id: chip.id,
        inbox_id: chip.chatwoot_inbox_id,
        devedor_id: dev?.id,
        devedor_nome: dev?.nome,
        processo: dev?.processo,
        valor_divida: dev?.saldo,
        telefone_id: tel.id,
        telefone_e164: tel.telefone_e164,
        contato_existente: dev?.chatwoot_contact_id ?? null,
        mensagem: conteudo,
        delay_typing: intervalo,
        simulacao,
      });
    }
  }

  return json({ ok: true, intervalo, simulacao, total: itens.length, itens });
});
