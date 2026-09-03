// SAVAN Recupera — enviar-mensagem (saída pelos canais Baileys: Evolution API ou baileys-api)
//
// Função ADITIVA: o `campanha-lote` e o n8n W01 seguem exatamente como estão. A troca do elo de
// envio é um passo de operação, feito quando houver o provedor no ar para testar contra — mexer
// no disparador crítico às cegas é o que custou uma campanha no §36.
//
// Dois provedores Baileys convivem aqui desde 03/09/2026 (`chips.conector` decide qual):
// `baileys` fala com a Evolution API; `baileys_chatwoot` fala com o baileys-api (fazer-ai), o
// provedor nativo do Chatwoot self-hosted. Mesma semântica de negócio, transporte diferente —
// ver `_shared/conector.ts` e `_shared/baileys-api-client.ts`.
//
// Por que o envio sai daqui e não pelo Chatwoot (ADR-0002): os dois provedores expõem presença e
// "digitando…", que são os sinais comportamentais pelos quais o WhatsApp separa humano de robô.
// Mandando pelo Chatwoot, perde-se esse controle — e num canal não-oficial o juiz é comportamental.
//
// SEGURANÇA: A1 — só o service_role pode chamar (mesma trava das outras 9 funções, §29/§30).
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { chipPodeAbordar, conectorDoChip } from "../_shared/conector.ts";
import { configEvolution, enviarTexto } from "../_shared/evolution-client.ts";
import { configBaileysApi, enviarTextoBaileysApi } from "../_shared/baileys-api-client.ts";
import { numeroParaJid } from "../_shared/evolution.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function carregarSegredos(sb: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await sb.from("segredos").select("chave, valor");
  const m: Record<string, string> = {};
  for (const r of data ?? []) if (r.valor) m[r.chave] = r.valor;
  return m;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // A1: exige JWT com claim role=service_role. Imune à rotação de chave (§30).
  let _role = "";
  try {
    let _p = ((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").split(".")[1] ?? "")
      .replace(/-/g, "+").replace(/_/g, "/");
    while (_p.length % 4) _p += "=";
    _role = JSON.parse(atob(_p)).role;
  } catch { _role = ""; }
  if (_role !== "service_role") return json({ ok: false, erro: "nao_autorizado" }, 401);

  const body = await req.json().catch(() => ({}));
  const chipId = Number(body.chip_id);
  const numeroE164 = String(body.numero_e164 ?? "").trim();
  const texto = String(body.texto ?? "");

  if (!Number.isInteger(chipId) || chipId <= 0) return json({ ok: false, erro: "chip_id_invalido" }, 400);
  if (!numeroE164) return json({ ok: false, erro: "numero_obrigatorio" }, 400);
  if (!texto.trim()) return json({ ok: false, erro: "texto_obrigatorio" }, 400);

  const sb = admin();

  const { data: chip } = await sb.from("chips")
    .select("id, conector, papel, instancia_evolution, numero_e164, status")
    .eq("id", chipId).maybeSingle();
  if (!chip) return json({ ok: false, erro: "chip_nao_encontrado" }, 404);

  // O mesmo veredicto que o seletor de lote usa — não existe caminho alternativo de saída.
  const veredicto = chipPodeAbordar(chip);
  if (!veredicto.pode) return json({ ok: false, erro: veredicto.motivo }, 409);

  // Modo simulação: registra a intenção sem tocar em ninguém real.
  if (body.simulacao === true) {
    return json({ ok: true, simulado: true, message_id: null, delay_ms: 0 });
  }

  const seg = await carregarSegredos(sb);
  const conector = conectorDoChip(chip);

  // baileys_chatwoot (baileys-api, fazer-ai) e baileys (Evolution) são dois transportes para a
  // mesma coisa: qual API o chip fala é decisão de `chips.conector`, tudo o resto (ritmo, opt-in,
  // §36/§38) é igual — ver `_shared/conector.ts`.
  if (conector === "baileys_chatwoot") {
    const cfg = configBaileysApi(seg);
    if (!cfg) return json({ ok: false, erro: "baileys_api_nao_configurada" }, 503);

    const jidDestino = numeroParaJid(numeroE164);
    const r = await enviarTextoBaileysApi(cfg, chip.numero_e164 as string, jidDestino, texto);

    if (!r.ok) {
      if (r.resultado === "chip_caido") {
        await sb.from("chips").update({ status: "desconectado" }).eq("id", chipId);
      }
      return json({ ok: false, resultado: r.resultado, status_provedor: r.status }, 502);
    }

    await sb.from("chips").update({ ultimo_envio_em: new Date().toISOString() }).eq("id", chipId);
    return json({ ok: true, message_id: r.messageId, delay_ms: r.delayMs });
  }

  const cfg = configEvolution(seg);
  if (!cfg) return json({ ok: false, erro: "evolution_nao_configurada" }, 503);

  const r = await enviarTexto(cfg, chip.instancia_evolution as string, numeroE164, texto);

  if (!r.ok) {
    // `chip_caido` é o sinal de que o problema é nosso, não do destinatário: derruba o chip para o
    // monitor/failover agir. Nunca marcamos o telefone aqui — quem decide isso é quem tem o item
    // da fila em mãos, com o `resultado` que devolvemos.
    if (r.resultado === "chip_caido") {
      await sb.from("chips").update({ status: "desconectado" }).eq("id", chipId);
    }
    return json({ ok: false, resultado: r.resultado, status_provedor: r.status }, 502);
  }

  await sb.from("chips").update({ ultimo_envio_em: new Date().toISOString() }).eq("id", chipId);

  return json({ ok: true, message_id: r.messageId, delay_ms: r.delayMs });
});
