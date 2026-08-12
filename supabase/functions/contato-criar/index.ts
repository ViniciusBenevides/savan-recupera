// SAVAN Recupera — contato-criar (valida WhatsApp, busca/cria contato + conversa no Chatwoot)
// SEGURANÇA (auditoria 2026-06-26): A1 — só o service_role (n8n / disparar-teste) pode chamar.
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
async function lerJson(r: Response): Promise<any | null> {
  try { return await r.json(); } catch { return null; }
}
function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}
async function carregarSegredos(sb: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await sb.from("segredos").select("chave, valor");
  const m: Record<string, string> = {};
  for (const r of data ?? []) if (r.valor) m[r.chave] = r.valor;
  return m;
}
async function getConfig(sb: SupabaseClient) {
  const { data } = await sb.from("configuracoes").select("chave, valor");
  const c: Record<string, any> = {};
  for (const r of data ?? []) c[r.chave] = r.valor;
  return c;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // A1: somente o service_role (n8n / disparar-teste) pode chamar. A anon key pública é recusada.
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
  const seg = await carregarSegredos(sb);
  const cfg = await getConfig(sb);
  const token = seg.CHATWOOT_TOKEN;
  const url = cfg.chatwoot?.url ?? "https://chatwoot.example.com";
  const acc = cfg.chatwoot?.account_id ?? 1;
  const H = { "api_access_token": token, "Content-Type": "application/json" };
  const body = await req.json();
  const { inbox_id, telefone_e164, devedor_id, devedor_nome, processo, valor_divida } = body;
  if (!inbox_id) return json({ ok: false, erro: "inbox_id_ausente" }, 400);

  const { data: chipRow } = await sb.from("chips")
    .select("cobrador_id, conector")
    .eq("chatwoot_inbox_id", inbox_id)
    .maybeSingle();
  if (!chipRow) return json({ ok: false, erro: "inbox_nao_vinculada_a_chip" }, 400);

  // Dry-run da campanha (modo_simulacao) NÃO deve criar contato/conversa reais no Chatwoot — isso
  // poluía o inbox com devedores reais sem enviar nada. O disparar-teste passa `teste_real:true`
  // p/ furar isso (ele manda mensagem de verdade ao SEU número de teste). Resolve o modo_simulacao
  // do MESMO chip (via inbox) que o campanha-lote usou, p/ casar a flag por cobrador.
  if (body.teste_real !== true) {
    const { data: simRows } = await sb.from("configuracoes").select("valor, cobrador_id").eq("chave", "modo_simulacao");
    let val: any = (simRows ?? []).find((r) => r.cobrador_id == null)?.valor;
    if (chipRow?.cobrador_id) { const o = (simRows ?? []).find((r) => r.cobrador_id === chipRow.cobrador_id); if (o) val = o.valor; }
    if (val === true || val === "true") return json({ ok: true, exists: true, conversation_id: null, contact_id: null, simulado: true });
  }

  let jidE164 = telefone_e164;
  // Native Meta inboxes return HTTP 200 + `null` from `on_whatsapp`, including for valid
  // numbers. Meta only confirms validity when Cloud API accepts or rejects the template.
  if (chipRow.conector !== "meta_cloud") {
    const wppR = await fetch(`${url}/api/v1/accounts/${acc}/inboxes/${inbox_id}/on_whatsapp`, {
      method: "POST", headers: H, body: JSON.stringify({ phone_number: telefone_e164 }),
    });
    const wpp = await lerJson(wppR);
    if (!wppR.ok || typeof wpp?.exists !== "boolean") {
      return json({ ok: false, erro: "validacao_whatsapp_indisponivel", status_provedor: wppR.status }, 502);
    }
    if (!wpp.exists) {
      if (body.telefone_id) await sb.from("telefones_devedor")
        .update({ whatsapp_valido: false, verificado_em: new Date().toISOString() })
        .eq("id", body.telefone_id);
      return json({ ok: true, exists: false });
    }

    const mJid = String(wpp.jid ?? "").match(/^(\d+)@/);
    if (mJid) jidE164 = "+" + mJid[1];
    if (body.telefone_id) await sb.from("telefones_devedor")
      .update({ whatsapp_valido: true, verificado_em: new Date().toISOString() })
      .eq("id", body.telefone_id);
  }

  // busca contato
  let contato: any = null;
  for (const q of [jidE164, jidE164.replace("+", ""), telefone_e164]) {
    const r = await fetch(`${url}/api/v1/accounts/${acc}/contacts/search?q=${encodeURIComponent(q)}`, { headers: H });
    const d = await lerJson(r);
    if (!r.ok) return json({ ok: false, erro: "chatwoot_busca_contato_falhou", status_provedor: r.status }, 502);
    if (d?.payload?.length) { contato = d.payload[0]; break; }
  }
  const attrs = { devedor_id, processo, valor_divida };
  if (!contato) {
    const r = await fetch(`${url}/api/v1/accounts/${acc}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ inbox_id, name: devedor_nome ?? "Cliente", phone_number: jidE164, custom_attributes: attrs }) });
    const d = await lerJson(r);
    if (!r.ok) return json({ ok: false, erro: "chatwoot_criar_contato_falhou", status_provedor: r.status }, 502);
    contato = d?.payload?.contact ?? d?.payload ?? d;
  } else {
    const r = await fetch(`${url}/api/v1/accounts/${acc}/contacts/${contato.id}`, { method: "PUT", headers: H, body: JSON.stringify({ custom_attributes: attrs }) });
    if (!r.ok) return json({ ok: false, erro: "chatwoot_atualizar_contato_falhou", status_provedor: r.status }, 502);
  }
  const contactId = contato?.id;
  if (!contactId) return json({ ok: false, erro: "chatwoot_contato_sem_id" }, 502);
  if (devedor_id && contactId) await sb.from("devedores").update({ chatwoot_contact_id: contactId }).eq("id", devedor_id);

  // A conversation requires the source_id of a real contact inbox. Ensure that relationship
  // explicitly instead of guessing the phone digits as source_id.
  let contactInboxes: any[] = Array.isArray(contato?.contact_inboxes) ? contato.contact_inboxes : [];
  let ci = contactInboxes.find((x: any) => Number(x.inbox?.id ?? x.inbox_id) === Number(inbox_id));
  if (!ci?.source_id) {
    const detalheR = await fetch(`${url}/api/v1/accounts/${acc}/contacts/${contactId}`, { headers: H });
    const detalhe = await lerJson(detalheR);
    if (!detalheR.ok) return json({ ok: false, erro: "chatwoot_buscar_contato_falhou", status_provedor: detalheR.status }, 502);
    const contatoDetalhe = detalhe?.payload ?? detalhe;
    contactInboxes = Array.isArray(contatoDetalhe?.contact_inboxes) ? contatoDetalhe.contact_inboxes : [];
    ci = contactInboxes.find((x: any) => Number(x.inbox?.id ?? x.inbox_id) === Number(inbox_id));
  }
  if (!ci?.source_id) {
    const ciR = await fetch(`${url}/api/v1/accounts/${acc}/contacts/${contactId}/contact_inboxes`, {
      method: "POST", headers: H, body: JSON.stringify({ inbox_id }),
    });
    const ciBody = await lerJson(ciR);
    if (!ciR.ok) return json({ ok: false, erro: "chatwoot_vincular_inbox_falhou", status_provedor: ciR.status }, 502);
    ci = ciBody?.payload ?? ciBody;
  }
  const sourceId = ci?.source_id;
  if (!sourceId) return json({ ok: false, erro: "chatwoot_contact_inbox_sem_source_id" }, 502);

  const convR = await fetch(`${url}/api/v1/accounts/${acc}/conversations`, {
    method: "POST", headers: H,
    body: JSON.stringify({ inbox_id, contact_id: contactId, source_id: sourceId, status: "open" }),
  });
  const conv = await lerJson(convR);
  if (!convR.ok || !conv?.id) {
    return json({ ok: false, erro: "chatwoot_criar_conversa_falhou", status_provedor: convR.status }, 502);
  }
  return json({ ok: true, exists: true, contact_id: contactId, conversation_id: conv.id, jid_e164: jidE164 });
});
