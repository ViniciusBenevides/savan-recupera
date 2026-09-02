// SAVAN Recupera — campanha-registrar
// Atualiza a fila após envio/simulação, cria a conversa no Supabase, métricas e evento.
// Propaga carteira_id (escopo multi-carteira) e a flag `simulacao` (modo teste).
// Em teste: carimba os registros mas NÃO conta métricas reais nem consome aquecimento do chip.
// SEGURANÇA (auditoria 2026-06-26): A1 — só o service_role (n8n) pode chamar; anon key recusada (401).
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}
async function getConfig(sb: SupabaseClient) {
  const { data } = await sb.from("configuracoes").select("chave, valor");
  const c: Record<string, any> = {};
  for (const r of data ?? []) c[r.chave] = r.valor;
  return c;
}

// Auth A1 (auditoria §29, revisado 2026-06-26): aceita só JWT de service_role. O verify_jwt da
// plataforma já validou a ASSINATURA; aqui barramos a anon key (role=anon) pelo claim `role`.
// Imune à rotação/novo sistema de API keys (não compara o valor cru do SERVICE_ROLE_KEY, que
// passou a divergir do JWT legado que o n8n envia → causava 401 em tudo).
function ehServiceRole(req: Request): boolean {
  try {
    const t = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    let p = (t.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    while (p.length % 4) p += "=";
    return JSON.parse(atob(p)).role === "service_role";
  } catch { return false; }
}

// Data e hora no fuso da operação — o orçamento de ritmo por hora (§33) é local, não UTC.
function dataHoraLocal(tz = "America/Sao_Paulo"): { dia: string; hora: number } {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const hora = new Date(new Date().toLocaleString("en-US", { timeZone: tz })).getHours();
  return { dia, hora };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ehServiceRole(req)) return json({ ok: false, erro: "nao_autorizado" }, 401);
  const sb = admin();
  const cfg = await getConfig(sb);
  const b = await req.json();
  const hoje = new Date().toISOString().slice(0, 10);
  const sim = b.simulacao === true || cfg.modo_simulacao === true || cfg.modo_simulacao === "true";

  if (b.status === "enviado") {
    await sb.from("fila_envios").update({
      status: "enviado", enviado_em: new Date().toISOString(),
      chatwoot_conversation_id: b.chatwoot_conversation_id ?? null, simulacao: sim,
    }).eq("id", b.fila_id);

    let carteiraId = b.carteira_id ?? null;
    if (!carteiraId) {
      const { data: d } = await sb.from("devedores").select("carteira_id").eq("id", b.devedor_id).maybeSingle();
      carteiraId = d?.carteira_id ?? null;
    }
    const { data: filaAtribuicao } = b.fila_id
      ? await sb.from("fila_envios")
        .select("fluxo_versao_id, meta_template_name, meta_template_language, mensagem_renderizada")
        .eq("id", b.fila_id).maybeSingle()
      : { data: null };
    const fluxoVersaoId = b.fluxo_versao_id ?? filaAtribuicao?.fluxo_versao_id ?? null;

    // Quando o 1º reenvio sai: pelo bloco de follow-up do fluxo da carteira (§35), que é onde o
    // operador enxerga o tempo de espera. Carteira sem fluxo cai no intervalo global de sempre.
    let horas = (cfg.followup?.intervalos_horas ?? [24, 72, 168])[0];
    if (carteiraId || fluxoVersaoId) {
      const { data: fluxo } = fluxoVersaoId
        ? await sb.from("fluxo_versoes").select("roteiro").eq("id", fluxoVersaoId).maybeSingle()
        : await sb.from("carteiras").select("roteiro").eq("id", carteiraId).maybeSingle();
      const primeiro = (fluxo?.roteiro?.etapas ?? []).find((e: any) => e?.tipo === "followup");
      if (Number(primeiro?.espera_horas) > 0) horas = Number(primeiro.espera_horas);
    }
    const prox = new Date(Date.now() + horas * 3600 * 1000).toISOString();

    if (b.chatwoot_conversation_id) {
      const linha = {
        devedor_id: b.devedor_id, carteira_id: carteiraId, chip_id: b.chip_id, telefone_id: b.telefone_id,
        fluxo_versao_id: fluxoVersaoId,
        chatwoot_conversation_id: b.chatwoot_conversation_id,
        // Em qual inbox esse ponteiro vive. Sem isso o painel não sabe distinguir uma conversa
        // atendível de uma que ficou apontando para a caixa de um número morto (§38).
        chatwoot_inbox_id: b.inbox_id ?? null,
        chatwoot_contact_id: b.chatwoot_contact_id ?? null,
        estado: "aguardando_resposta", ultima_msg_em: new Date().toISOString(),
        ultima_msg_de: "bot", proximo_followup_em: prox, simulacao: sim,
      };

      // A conversa é do DEVEDOR, não do transporte (ADR-0001). Quando um chip novo aborda alguém
      // que já foi abordado pelo chip antigo, o `contato-criar` abre uma conversa NOVA no Chatwoot
      // — em outra inbox — e o upsert por `chatwoot_conversation_id` não encontraria conflito:
      // inseriria uma segunda linha para o mesmo devedor. O dossiê racharia bem no cenário para o
      // qual ele foi feito (430 conversas herdadas do número banido), e o robô repetiria o que o
      // número anterior já disse. Então procuramos a linha do devedor antes de criar outra.
      const { data: existente } = await sb.from("conversas")
        .select("id, chatwoot_conversation_id")
        .eq("devedor_id", b.devedor_id)
        .eq("simulacao", sim)
        .order("ultima_msg_em", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .limit(1).maybeSingle();

      const { data: convUp } = existente && existente.chatwoot_conversation_id !== b.chatwoot_conversation_id
        ? await sb.from("conversas").update(linha).eq("id", existente.id).select("id").maybeSingle()
        : await sb.from("conversas").upsert(linha, { onConflict: "chatwoot_conversation_id" })
            .select("id").maybeSingle();

      // Grava a mensagem de abordagem em `mensagens` (a aba "Conversas" do painel lê dessa
      // tabela; antes só `bot-turno`/`followup`/`disparar-teste` escreviam aqui, então a 1ª
      // mensagem da campanha não aparecia). O texto vem do corpo (se o n8n mandar) ou do que o
      // `campanha-lote` salvou em `fila_envios.mensagem_renderizada`. Guarda contra duplicar em retry.
      const conversaLocalId = convUp?.id ?? null;
      if (conversaLocalId) {
        let texto: string | null = b.mensagem ?? null;
        if (!texto && b.fila_id) {
          texto = filaAtribuicao?.mensagem_renderizada ?? null;
        }
        if (texto) {
          const { data: existe } = await sb.from("mensagens")
            .select("id").eq("conversa_id", conversaLocalId).eq("direcao", "saida").eq("conteudo", texto).limit(1).maybeSingle();
          if (existe) {
            await sb.from("mensagens").update({
              origem: "bot", chatwoot_message_id: b.chatwoot_message_id ?? null, simulacao: sim,
            }).eq("id", existe.id);
          } else {
            await sb.from("mensagens").upsert({
              conversa_id: conversaLocalId, direcao: "saida", origem: "bot", conteudo: texto,
              chatwoot_message_id: b.chatwoot_message_id ?? null, simulacao: sim,
            }, b.chatwoot_message_id ? { onConflict: "chatwoot_message_id" } : undefined);
          }
        }
      }
    }

    // dry-run (teste) não mexe no status real do devedor (antes marcava devedores reais como "contatado")
    if (!sim) await sb.from("devedores").update({ status_cobranca: "contatado" })
      .eq("id", b.devedor_id).in("status_cobranca", ["na_fila", "pendente"]);
    // teste não consome aquecimento do chip nem entra nas métricas reais do dia
    if (!sim) {
      await sb.rpc("fn_inc_chip_metrica", { p_chip: b.chip_id, p_dia: hoje, p_novos: 1, p_msgs: 1, p_resp: 0 });
      await sb.rpc("fn_inc_metrica_dia", { p_dia: hoje, p_campo: "enviados", p_n: 1 });
      // contador por HORA (§33): alimenta o orçamento de ritmo do campanha-lote e o heatmap.
      // Usa data/hora LOCAIS (a janela de envio é local); dentro da janela 8h–20h de São Paulo a data
      // local coincide com a UTC usada acima, então as duas contagens não divergem.
      const { dia: diaLocal, hora } = dataHoraLocal();
      await sb.rpc("fn_inc_chip_metrica_hora", { p_chip: b.chip_id, p_dia: diaLocal, p_hora: hora, p_msgs: 1, p_resp: 0 });
    }
    await sb.from("chips").update({ ultimo_envio_em: new Date().toISOString() }).eq("id", b.chip_id);
    await sb.from("eventos_campanha").insert({
      tipo: "envio", devedor_id: b.devedor_id, chip_id: b.chip_id, carteira_id: carteiraId,
      payload: {
        simulacao: sim,
        fluxo_versao_id: fluxoVersaoId,
        meta_template_name: filaAtribuicao?.meta_template_name ?? b.meta_template_name ?? null,
        meta_template_language: filaAtribuicao?.meta_template_language ?? null,
      },
    });
  } else if (b.status === "sem_whatsapp") {
    await sb.from("fila_envios").update({ status: "sem_whatsapp", erro: b.erro ?? "on_whatsapp_false" }).eq("id", b.fila_id);
    let carteiraId = b.carteira_id ?? null;
    if (!carteiraId) {
      const { data: d } = await sb.from("devedores").select("carteira_id").eq("id", b.devedor_id).maybeSingle();
      carteiraId = d?.carteira_id ?? null;
    }
    const { data: prox } = await sb.rpc("fn_proximo_telefone", { p_devedor_id: b.devedor_id, p_excluir: b.telefone_id });
    if (prox && prox.length) {
      await sb.from("fila_envios").insert({ devedor_id: b.devedor_id, telefone_id: prox[0].id, carteira_id: carteiraId, prioridade: b.prioridade ?? 0, status: "aguardando", simulacao: sim });
    } else {
      await sb.from("devedores").update({ status_cobranca: "sem_whatsapp" }).eq("id", b.devedor_id);
    }
  } else {
    await sb.from("fila_envios").update({ status: "falha", erro: b.erro ?? "erro_envio", tentativas: (b.tentativas ?? 0) + 1 }).eq("id", b.fila_id);
    if (!sim) await sb.rpc("fn_inc_metrica_dia", { p_dia: hoje, p_campo: "falhas", p_n: 1 });
  }

  return json({ ok: true });
});
