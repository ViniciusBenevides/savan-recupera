// SAVAN Recupera — campanha-followup
// Reengaja conversas sem resposta APENAS de carteiras ativas: respeita janela/horário,
// máximo de tentativas e intervalos crescentes. Após o máximo, encerra a conversa.
// (Deployada self-contained via MCP; este arquivo é a referência no repo.)
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
function admin(): SupabaseClient { return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }); }
async function carregarSegredos(sb: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await sb.from("segredos").select("chave, valor");
  const m: Record<string, string> = {}; for (const r of data ?? []) if (r.valor) m[r.chave] = r.valor; return m;
}
async function getConfig(sb: SupabaseClient) {
  const { data } = await sb.from("configuracoes").select("chave, valor");
  const c: Record<string, any> = {}; for (const r of data ?? []) c[r.chave] = r.valor; return c;
}
function resolverSpintax(t: string): string { let p = "", c = t; while (c !== p) { p = c; c = c.replace(/\{([^{}]*\|[^{}]*)\}/g, (_m, g) => { const o = g.split("|"); return o[Math.floor(Math.random() * o.length)]; }); } return c; }
function render(tpl: string, v: Record<string, unknown>): string { return resolverSpintax(tpl).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => { const x = v[k]; return x == null ? "" : String(x); }); }
function dentroJanela(j: any): boolean {
  const tz = j?.tz ?? "America/Sao_Paulo";
  const pp = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(pp.find((p) => p.type === "hour")?.value ?? "0"); const m = Number(pp.find((p) => p.type === "minute")?.value ?? "0");
  const min = h * 60 + m; const dow = new Date(new Date().toLocaleString("en-US", { timeZone: tz })).getDay();
  if (!(j?.dias ?? [1, 2, 3, 4, 5, 6]).includes(dow)) return false;
  const [hi, mi] = String(j?.inicio ?? "08:00").split(":").map(Number); const [hf, mf] = String(j?.fim ?? "20:00").split(":").map(Number);
  return min >= hi * 60 + mi && min < hf * 60 + mf;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();
  const seg = await carregarSegredos(sb);
  const cfg = await getConfig(sb);
  if (!(cfg.campanha_ativa === true || cfg.campanha_ativa === "true")) return json({ ok: true, motivo: "campanha_inativa" });
  if (!dentroJanela(cfg.janela_envio)) return json({ ok: true, motivo: "fora_da_janela" });
  const simulacao = cfg.modo_simulacao === true || cfg.modo_simulacao === "true";
  const maxFu = Number(cfg.followup?.max ?? 3);
  const intervalos: number[] = cfg.followup?.intervalos_horas ?? [24, 72, 168];
  const cwUrl = (cfg.chatwoot?.url ?? "https://chatwoot.example.com").replace(/\/$/, "");
  const acc = cfg.chatwoot?.account_id ?? 1;

  // só carteiras ativas
  const { data: ativas } = await sb.from("carteiras").select("id, credor").eq("status", "ativa");
  const idsAtivas = (ativas ?? []).map((c) => c.id);
  if (idsAtivas.length === 0) return json({ ok: true, motivo: "sem_carteira_ativa", enviados: 0 });
  const credorPorCarteira = new Map<number, string | null>((ativas ?? []).map((c) => [c.id, c.credor]));

  const { data: convs } = await sb.from("conversas")
    .select("id, devedor_id, carteira_id, chatwoot_conversation_id, followups_enviados")
    .eq("estado", "aguardando_resposta").in("carteira_id", idsAtivas)
    .lte("proximo_followup_em", new Date().toISOString())
    .order("proximo_followup_em").limit(30);

  let enviados = 0, encerrados = 0;
  for (const c of convs ?? []) {
    const n = c.followups_enviados ?? 0;
    if (n >= maxFu) {
      await sb.from("conversas").update({ estado: "encerrada", proximo_followup_em: null }).eq("id", c.id);
      encerrados++; continue;
    }
    const { data: dev } = await sb.from("devedores").select("nome").eq("id", c.devedor_id).single();
    const pn = (dev?.nome ?? "").split(" ")[0];
    const credor = credorPorCarteira.get(c.carteira_id) ?? "";
    const tipo = `followup_${n + 1}`;
    const { data: tpl } = await sb.from("templates_mensagem").select("conteudo").eq("tipo", tipo).eq("ativo", true).limit(1).maybeSingle();
    const texto = tpl ? render(tpl.conteudo, { primeiro_nome: pn.charAt(0) + pn.slice(1).toLowerCase(), nome_bot: cfg.ia?.nome_bot ?? "Ana", credor }) : `Olá ${pn}, tudo bem? Ainda dá tempo de aproveitar a condição especial${credor ? ` da ${credor}` : ""}.`;

    if (!simulacao) {
      await fetch(`${cwUrl}/api/v1/accounts/${acc}/conversations/${c.chatwoot_conversation_id}/messages`, {
        method: "POST", headers: { "api_access_token": seg.CHATWOOT_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ content: texto, message_type: "outgoing", content_attributes: { zapi_args: { delayTyping: 8 } } }),
      });
    }
    const proxIdx = Math.min(n + 1, intervalos.length - 1);
    const prox = new Date(Date.now() + intervalos[proxIdx] * 3600000).toISOString();
    await sb.from("conversas").update({ followups_enviados: n + 1, proximo_followup_em: prox, ultima_msg_em: new Date().toISOString(), ultima_msg_de: "bot" }).eq("id", c.id);
    await sb.from("mensagens").insert({ conversa_id: c.id, direcao: "saida", origem: "bot", conteudo: texto });
    await sb.from("eventos_campanha").insert({ tipo: "followup", devedor_id: c.devedor_id, carteira_id: c.carteira_id, payload: { n: n + 1 } });
    enviados++;
  }
  return json({ ok: true, enviados, encerrados });
});
