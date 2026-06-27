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

    const horas = (cfg.followup?.intervalos_horas ?? [24, 72, 168])[0];
    const prox = new Date(Date.now() + horas * 3600 * 1000).toISOString();

    let carteiraId = b.carteira_id ?? null;
    if (!carteiraId) {
      const { data: d } = await sb.from("devedores").select("carteira_id").eq("id", b.devedor_id).maybeSingle();
      carteiraId = d?.carteira_id ?? null;
    }

    if (b.chatwoot_conversation_id) {
      const { data: convUp } = await sb.from("conversas").upsert({
        devedor_id: b.devedor_id, carteira_id: carteiraId, chip_id: b.chip_id, telefone_id: b.telefone_id,
        chatwoot_conversation_id: b.chatwoot_conversation_id,
        chatwoot_contact_id: b.chatwoot_contact_id ?? null,
        estado: "aguardando_resposta", ultima_msg_em: new Date().toISOString(),
        ultima_msg_de: "bot", proximo_followup_em: prox, simulacao: sim,
      }, { onConflict: "chatwoot_conversation_id" }).select("id").maybeSingle();

      // Grava a mensagem de abordagem em `mensagens` (a aba "Conversas" do painel lê dessa
      // tabela; antes só `bot-turno`/`followup`/`disparar-teste` escreviam aqui, então a 1ª
      // mensagem da campanha não aparecia). O texto vem do corpo (se o n8n mandar) ou do que o
      // `campanha-lote` salvou em `fila_envios.mensagem_renderizada`. Guarda contra duplicar em retry.
      const conversaLocalId = convUp?.id ?? null;
      if (conversaLocalId) {
        let texto: string | null = b.mensagem ?? null;
        if (!texto && b.fila_id) {
          const { data: filaRow } = await sb.from("fila_envios").select("mensagem_renderizada").eq("id", b.fila_id).maybeSingle();
          texto = filaRow?.mensagem_renderizada ?? null;
        }
        if (texto) {
          const { data: existe } = await sb.from("mensagens")
            .select("id").eq("conversa_id", conversaLocalId).eq("direcao", "saida").eq("conteudo", texto).limit(1).maybeSingle();
          if (!existe) {
            await sb.from("mensagens").insert({ conversa_id: conversaLocalId, direcao: "saida", origem: "bot", conteudo: texto, simulacao: sim });
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
    }
    await sb.from("chips").update({ ultimo_envio_em: new Date().toISOString() }).eq("id", b.chip_id);
    await sb.from("eventos_campanha").insert({ tipo: "envio", devedor_id: b.devedor_id, chip_id: b.chip_id, carteira_id: carteiraId, payload: { simulacao: sim } });
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
