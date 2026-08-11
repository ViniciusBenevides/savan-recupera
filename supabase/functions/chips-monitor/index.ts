// SAVAN Recupera — chips-monitor
// Consulta a saude de cada numero na Graph API da Meta e atualiza chips.status/saude.
// Se desconectar, pausa o chip e registra evento (o dashboard alerta o gestor).
// NOTA: versão self-contained (igual à deployada via MCP). Chamada pelo W08 (n8n, 15 min).
// SEGURANÇA (auditoria 2026-06-26): A1 — só o service_role (n8n) pode chamar; anon key recusada (401).
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
function admin(): SupabaseClient { return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // A1: somente o service_role (n8n) pode chamar. A anon key pública é recusada.
  // Trava revisada (§29): exige JWT de service_role pelo claim `role` (o verify_jwt já validou a
  // assinatura). Imune à rotação/novo sistema de API keys do Supabase — antes comparava o valor cru
  // do SERVICE_ROLE_KEY e quebrava (401 em tudo) quando a chave do env divergia do JWT do n8n.
  let _role = "";
  try {
    let _p = ((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    while (_p.length % 4) _p += "=";
    _role = JSON.parse(atob(_p)).role;
  } catch { _role = ""; }
  if (_role !== "service_role") return json({ ok: false, erro: "nao_autorizado" }, 401);
  const sb = admin();

  // config "ritmo" (§33): controla a auto-trava de abordagem quando a qualidade Meta cai para RED
  const { data: cfgRitmo } = await sb.from("configuracoes").select("valor").eq("chave", "ritmo").is("cobrador_id", null).maybeSingle();
  const ritmoCfg: Record<string, any> = cfgRitmo?.valor ?? {};

  const { data: chips } = await sb.from("chips").select("id, nome, status, cobrador_id").not("status", "in", "(cadastrado,banido)");
  const resultados: any[] = [];
  const hoje = new Date().toISOString().slice(0, 10);
  // WABAs vistas no loop -> sincronizacao do cache de templates no fim (ver abaixo)
  const wabas = new Map<string, { waba: string; token: string; cobrador: string }>();
  for (const chip of chips ?? []) {
    // Saude do numero na Meta: qualidade, tier de limite e status — e o que diz se ele esta perto
    // de ser restringido. O painel mostra isso no card do chip.
    const { data: credM } = await sb.from("chips_credenciais_meta").select("phone_number_id, access_token, waba_id").eq("chip_id", chip.id).maybeSingle();
    if (!credM) continue;
    if (credM.waba_id) wabas.set(`${chip.cobrador_id}|${credM.waba_id}`, { waba: credM.waba_id, token: credM.access_token, cobrador: chip.cobrador_id });
    let saude: any = null, ok = false;
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${credM.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,status,name_status`, { headers: { Authorization: `Bearer ${credM.access_token}` } });
      const d = await r.json();
      if (r.ok) {
        ok = true;
        const { data: met } = await sb.from("chip_metricas_diarias").select("novos_contatos").eq("chip_id", chip.id).eq("dia", hoje).maybeSingle();
        saude = {
          quality_rating: d.quality_rating ?? "UNKNOWN", messaging_limit_tier: d.messaging_limit_tier ?? "TIER_250",
          number_status: d.status ?? "UNKNOWN", name_status: d.name_status ?? null, verified_name: d.verified_name ?? null,
          msgs_hoje: met?.novos_contatos ?? 0, atualizado_em: new Date().toISOString(),
        };
      } else { saude = { erro: d?.error?.message ?? "graph erro", atualizado_em: new Date().toISOString() }; }
    } catch (e) { saude = { erro: String(e) }; }

    // número RESTRINGIDO pela Meta (status != CONNECTED) = equivalente ao "chip caiu": pausa + failover.
    let novoStatus = chip.status;
    let travarAte: string | null = null;
    const restrito = ok && saude?.number_status && saude.number_status !== "CONNECTED";
    if (restrito && ["ativo", "aquecendo", "conectado"].includes(chip.status)) {
      novoStatus = "desconectado";
      await sb.from("eventos_campanha").insert({ tipo: "chip_status", chip_id: chip.id, payload: { status: "desconectado", motivo: "meta_restrito", nome: chip.nome } });
      const { data: resumo } = await sb.rpc("fn_failover_resumo", { p_chip_id: chip.id });
      const tem = ((resumo?.aguardando ?? 0) + (resumo?.conversas_ativas ?? 0) + (resumo?.escaladas ?? 0)) > 0;
      if (tem) {
        const { data: existe } = await sb.from("failover_eventos").select("id").eq("chip_caido_id", chip.id).eq("status", "pendente").maybeSingle();
        if (!existe) await sb.from("failover_eventos").insert({ chip_caido_id: chip.id, resumo });
      }
    } else if (ok && saude?.quality_rating === "RED") {
      // qualidade vermelha: o número ainda envia, mas está perto de ser restrito → registra alerta
      // (uma vez por dia, para não poluir) para o painel/feed avisar o gestor.
      const { data: jaHoje } = await sb.from("eventos_campanha").select("id").eq("tipo", "chip_qualidade").eq("chip_id", chip.id).gte("criado_em", `${hoje}T00:00:00Z`).maybeSingle();
      if (!jaHoje) await sb.from("eventos_campanha").insert({ tipo: "chip_qualidade", chip_id: chip.id, payload: { quality: "RED", nome: chip.nome } });
      // AUTO-TRAVA (§33): avisar não bastava — quem está em RED e continua abordando estranhos vai
      // para restrição. Trava só a ABORDAGEM (fn_selecionar_lote ignora o chip); responder quem já
      // respondeu segue valendo, porque conversa em andamento não é o que derruba o número.
      if (ritmoCfg.pausar_em_red !== false) {
        const horas = Number(ritmoCfg.trava_red_horas ?? 72);
        travarAte = new Date(Date.now() + horas * 3600_000).toISOString();
      }
    }
    await sb.from("chips").update({ saude, status: novoStatus, ...(travarAte ? { abordagem_travada_ate: travarAte } : {}) }).eq("id", chip.id);
    resultados.push({ chip: chip.id, quality: saude?.quality_rating, status: novoStatus });
  }
  // Cache de templates (§32): a campanha so dispara com modelo APROVADO, e quem decide isso e a
  // Meta — o status muda de PENDING para APPROVED/REJECTED sozinho, horas depois de submeter.
  // Sem esta sincronizacao periodica o painel (e o campanha-lote) ficariam olhando um retrato
  // velho e a campanha nao destravaria sozinha quando a aprovacao saisse.
  let templatesSincronizados = 0;
  for (const w of wabas.values()) {
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${w.waba}/message_templates?fields=id,name,status,category,language,components,quality_score,rejected_reason&limit=200`, { headers: { Authorization: `Bearer ${w.token}` } });
      const d = await r.json();
      if (!r.ok) continue;
      for (const t of d?.data ?? []) {
        await sb.from("meta_templates").upsert({
          cobrador_id: w.cobrador, waba_id: w.waba, meta_template_id: t.id ?? null,
          name: t.name, language: t.language, category: t.category, status: t.status,
          components: t.components ?? null, rejection_reason: t.rejected_reason ?? null,
          quality_score: t.quality_score?.score ?? t.quality_score ?? null,
          sincronizado_em: new Date().toISOString(),
        }, { onConflict: "cobrador_id,waba_id,name,language" });
        templatesSincronizados++;
      }
    } catch (_e) { /* nao derruba o monitor de chips */ }
  }

  return json({ ok: true, chips: resultados, templates: templatesSincronizados });
});
