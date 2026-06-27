// SAVAN Recupera — webhook-asaas (self-contained = deployada)
// Recebe eventos de cobrança do Asaas. Responde 200 nos eventos legítimos (senão a fila do Asaas pausa).
// SEGURANÇA (auditoria 2026-06-26):
//  - M2: validação de token fail-CLOSED (token ausente OU divergente => 401). Antes, token vazio liberava tudo.
//  - M2: idempotência — só envia confirmação/quitação na PRIMEIRA transição p/ recebido/confirmado.
//  - B3: não vaza detalhe de erro interno no corpo da resposta.
// Pagamento de teste (simulacao) não dispara mensagem real.
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, asaas-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}
async function carregarSegredos(sb: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await sb.from("segredos").select("chave, valor").is("cobrador_id", null);
  const m: Record<string, string> = {};
  for (const r of data ?? []) if (r.valor) m[r.chave] = r.valor;
  return m;
}
async function getConfig(sb: SupabaseClient) {
  const { data } = await sb.from("configuracoes").select("chave, valor").is("cobrador_id", null);
  const c: Record<string, any> = {};
  for (const r of data ?? []) c[r.chave] = r.valor;
  return c;
}
function resolverSpintax(t: string): string {
  let prev = "", cur = t;
  while (cur !== prev) { prev = cur; cur = cur.replace(/\{([^{}]*\|[^{}]*)\}/g, (_m, g) => { const o = g.split("|"); return o[Math.floor(Math.random() * o.length)]; }); }
  return cur;
}
function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  return resolverSpintax(tpl).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => { const v = vars[k]; return v === undefined || v === null ? "" : String(v); });
}
async function templateConteudo(sb: SupabaseClient, tipo: string, cob: string | null): Promise<string | null> {
  async function buscar(c: string | null) {
    let q = sb.from("templates_mensagem").select("conteudo").eq("tipo", tipo).eq("ativo", true).limit(1);
    q = c ? q.eq("cobrador_id", c) : q.is("cobrador_id", null);
    const { data } = await q.maybeSingle();
    return data?.conteudo ?? null;
  }
  return (cob ? await buscar(cob) : null) ?? await buscar(null);
}
async function cwEnviar(cfg: any, token: string, convId: number, conteudo: string, delay = 6) {
  const url = cfg.chatwoot?.url ?? "https://chatwoot.example.com";
  const acc = cfg.chatwoot?.account_id ?? 1;
  await fetch(`${url}/api/v1/accounts/${acc}/conversations/${convId}/messages`, {
    method: "POST", headers: { "api_access_token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ content: conteudo, message_type: "outgoing", content_attributes: { zapi_args: { delayTyping: delay } } }),
  });
}
async function cwLabels(cfg: any, token: string, convId: number, labels: string[]) {
  const url = cfg.chatwoot?.url ?? "https://chatwoot.example.com";
  const acc = cfg.chatwoot?.account_id ?? 1;
  await fetch(`${url}/api/v1/accounts/${acc}/conversations/${convId}/labels`, {
    method: "POST", headers: { "api_access_token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ labels }),
  });
}

const MAP: Record<string, string> = {
  PAYMENT_RECEIVED: "recebido", PAYMENT_CONFIRMED: "confirmado", PAYMENT_OVERDUE: "vencido",
  PAYMENT_REFUNDED: "estornado", PAYMENT_DELETED: "cancelado",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = admin();
    const seg = await carregarSegredos(sb);
    const tokenEsperado = seg.ASAAS_WEBHOOK_TOKEN;
    const tokenRecebido = req.headers.get("asaas-access-token");
    // M2: fail-closed. Sem token configurado OU divergente => recusa (antes, token vazio liberava tudo).
    if (!tokenEsperado || tokenRecebido !== tokenEsperado) return json({ ok: false, motivo: "token_invalido" }, 401);

    const evt = await req.json();
    const cfg = await getConfig(sb);
    const payment = evt?.payment;
    const novoStatus = MAP[evt?.event];
    if (!payment?.id || !novoStatus) return json({ ok: true, ignorado: true });

    const { data: pg } = await sb.from("pagamentos").select("id, devedor_id, valor, status, simulacao").eq("asaas_payment_id", payment.id).maybeSingle();
    if (!pg) return json({ ok: true, motivo: "pagamento_desconhecido" });

    // M2: idempotência — só age na PRIMEIRA transição para recebido/confirmado.
    const jaConfirmado = pg.status === "recebido" || pg.status === "confirmado";
    await sb.from("pagamentos").update({ status: novoStatus, valor_liquido: payment.netValue ?? null }).eq("id", pg.id);

    if ((novoStatus === "recebido" || novoStatus === "confirmado") && !pg.simulacao && !jaConfirmado) {
      const { data: dev } = await sb.from("devedores").select("id, nome, cpf_cnpj, processo, carteira_id").eq("id", pg.devedor_id).single();
      // cobrador dono da carteira -> usa os templates dele (cai no global)
      let cob: string | null = null;
      if (dev?.carteira_id) {
        const { data: cart } = await sb.from("carteiras").select("cobrador_id").eq("id", dev.carteira_id).maybeSingle();
        cob = cart?.cobrador_id ?? null;
      }
      const { data: conv } = await sb.from("conversas").select("chatwoot_conversation_id").eq("devedor_id", pg.devedor_id).order("criado_em", { ascending: false }).limit(1).maybeSingle();
      const pn = (dev?.nome ?? "").split(" ")[0];
      const vars = { primeiro_nome: pn.charAt(0) + pn.slice(1).toLowerCase(), nome: dev?.nome, cpf: dev?.cpf_cnpj, processo: dev?.processo, valor_pago: pg.valor, data_pagamento: new Date().toLocaleDateString("pt-BR") };
      if (conv?.chatwoot_conversation_id) {
        const tConf = await templateConteudo(sb, "confirmacao_pagamento", cob);
        const tQuit = await templateConteudo(sb, "quitacao", cob);
        if (tConf) await cwEnviar(cfg, seg.CHATWOOT_TOKEN, conv.chatwoot_conversation_id, renderTemplate(tConf, vars));
        if (tQuit) await cwEnviar(cfg, seg.CHATWOOT_TOKEN, conv.chatwoot_conversation_id, renderTemplate(tQuit, vars));
        await cwLabels(cfg, seg.CHATWOOT_TOKEN, conv.chatwoot_conversation_id, ["pix-pago", "acordo"]);
      }
    }
    return json({ ok: true });
  } catch (e) {
    console.error("webhook-asaas erro:", e);
    // B3: não vaza detalhe interno no corpo.
    return json({ ok: true }, 200);
  }
});
