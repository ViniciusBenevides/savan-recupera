// SAVAN Recupera — gerar-pix (cliente Asaas + Pix split + grava negociação/pagamento)
// Wallet/comissão por carteira (config_override.asaas) com fallback global.
// Chave Asaas por cobrador (ASAAS_API_KEY_*) resolvida pelo cobrador da carteira (fallback global).
// Trava de segurança: em produção SEM walletId do credor o split não acontece -> recusa.
// Modo teste: nunca toca produção; Pix sandbox (ou fake se não houver chave sandbox), marcado simulacao.
// SEGURANÇA (auditoria 2026-06-26):
//  - A1: só o service_role (bot-turno/n8n) pode chamar; a anon key pública é recusada (401).
//  - A2: preço derivado do servidor (fn_proposta). O valor do corpo só é aceito DENTRO da faixa
//        permitida [piso-com-extra .. base]; valores fora (ex.: R$0,01) são ignorados.
//  - M1: idempotência — reusa cobrança pendente idêntica recente (evita Pix duplicado em corrida).
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
async function carregarSegredos(sb: SupabaseClient, cobradorId: string | null = null): Promise<Record<string, string>> {
  const { data: glob } = await sb.from("segredos").select("chave, valor").is("cobrador_id", null);
  const m: Record<string, string> = {};
  for (const r of glob ?? []) if (r.valor) m[r.chave] = r.valor;
  if (cobradorId) {
    const { data: own } = await sb.from("segredos").select("chave, valor").eq("cobrador_id", cobradorId);
    for (const r of own ?? []) if (r.valor) m[r.chave] = r.valor;
  }
  return m;
}
async function getConfig(sb: SupabaseClient) {
  const { data } = await sb.from("configuracoes").select("chave, valor");
  const c: Record<string, any> = {};
  for (const r of data ?? []) c[r.chave] = r.valor;
  return c;
}
class Asaas {
  private base: string;
  constructor(private apiKey: string, ambiente: string) {
    this.base = ambiente === "producao" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  }
  private h() { return { "access_token": this.apiKey, "Content-Type": "application/json", "User-Agent": "SAVAN-Recupera" }; }
  async acharOuCriarCliente(p: any): Promise<string> {
    const busca = await fetch(`${this.base}/customers?externalReference=${encodeURIComponent(p.externalReference)}`, { headers: this.h() });
    const bd = await busca.json();
    if (bd?.data?.length) return bd.data[0].id;
    const r = await fetch(`${this.base}/customers`, { method: "POST", headers: this.h(), body: JSON.stringify({ name: p.nome, cpfCnpj: p.cpfCnpj, mobilePhone: p.mobilePhone, externalReference: p.externalReference, notificationDisabled: true }) });
    const d = await r.json();
    if (!d?.id) throw new Error("asaas_customer: " + JSON.stringify(d));
    return d.id;
  }
  async criarPix(p: any) {
    const body: any = { customer: p.customer, billingType: "PIX", value: p.value, dueDate: p.dueDate, externalReference: p.externalReference, description: p.description };
    if (p.walletSavan) body.split = [{ walletId: p.walletSavan, percentualValue: 100 - p.comissaoPct }];
    const r = await fetch(`${this.base}/payments`, { method: "POST", headers: this.h(), body: JSON.stringify(body) });
    const d = await r.json();
    if (!d?.id) throw new Error("asaas_payment: " + JSON.stringify(d));
    return d;
  }
  async pixQrCode(id: string) { const r = await fetch(`${this.base}/payments/${id}/pixQrCode`, { headers: this.h() }); return await r.json(); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // A1: somente o service_role (bot-turno / n8n) gera Pix. A anon key pública é recusada.
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
  const cfg = await getConfig(sb);
  const b = await req.json();

  const simulacao = b.simulacao === true || cfg.modo_simulacao === true || cfg.modo_simulacao === "true";

  const { data: dev } = await sb.from("devedores").select("id, nome, cpf_cnpj, processo, saldo, carteira_id, asaas_customer_id, chatwoot_contact_id").eq("id", b.devedor_id).single();
  if (!dev) return json({ ok: false, erro: "devedor_nao_encontrado" }, 404);

  // carteira: override de Asaas + faixas de desconto + cobrador dono
  let cartAsaas: any = {};
  let faixasCart: any = null;
  let cobradorId: string | null = null;
  if (dev.carteira_id) {
    const { data: cart } = await sb.from("carteiras").select("cobrador_id, config_override").eq("id", dev.carteira_id).maybeSingle();
    cartAsaas = cart?.config_override?.asaas ?? {};
    faixasCart = cart?.config_override?.faixas_desconto ?? null;
    cobradorId = cart?.cobrador_id ?? null;
  }

  // A2: preço do servidor. fn_proposta dá a base; aceitamos um valor do corpo SOMENTE dentro da
  // faixa [piso-com-extra .. base] — nunca um valor arbitrário (ex.: R$0,01).
  const { data: prop } = await sb.rpc("fn_proposta", { p_devedor_id: dev.id });
  const valorOriginal = Number(prop.valor_original) || 0;
  const baseValor = Number(prop.valor_final);
  const faixas = faixasCart ?? cfg.faixas_desconto;
  const minPix = Number(faixas?.valor_minimo_pix ?? 30);
  const maxExtraPct = Math.min(80, Number(prop.desconto_pct) + Number(prop.margem_extra_pp ?? 0));
  let pisoValor = Math.round(valorOriginal * (1 - maxExtraPct / 100) * 100) / 100;
  if (pisoValor < minPix) pisoValor = Math.min(valorOriginal || minPix, minPix);

  let valorFinal = baseValor;
  let descontoPct = Number(prop.desconto_pct);
  const pedido = Number(b.valor_final);
  if (Number.isFinite(pedido) && pedido >= pisoValor && pedido <= baseValor) {
    valorFinal = pedido;
    if (valorOriginal > 0) descontoPct = Math.round((1 - pedido / valorOriginal) * 100);
  }
  const extraAplicado = valorFinal < baseValor - 0.001;

  const seg = await carregarSegredos(sb, cobradorId);
  const asaasCfg = { ...(cfg.asaas ?? {}), ...cartAsaas };
  const ambienteCfg = asaasCfg.ambiente === "producao" ? "producao" : "sandbox";
  const ambiente = simulacao ? "sandbox" : ambienteCfg; // teste NUNCA toca produção
  const comissaoPct = Number(asaasCfg.comissao_pct ?? 10);
  const walletCredor = asaasCfg.wallet || asaasCfg.wallet_savan || undefined;

  // Trava de segurança (dinheiro): em produção real, sem walletId do credor o split 90/10
  // não acontece e 100% ficaria na conta do operador. Recusa em vez de errar o destino.
  if (!simulacao && ambiente === "producao" && !walletCredor) {
    return json({ ok: false, erro: "wallet_credor_ausente", detalhe: "Configure o Wallet ID do credor (Configurações > Asaas, ou na carteira) antes de gerar Pix em produção. Sem ele, o split 90/10 não acontece e tudo cairia na conta do operador." }, 400);
  }

  // M1: idempotência — se já há cobrança PENDENTE idêntica recente (< 2 min), reusa em vez de
  // criar outra (evita Pix/charge duplicado em chamadas concorrentes do bot).
  {
    const { data: dup } = await sb.from("pagamentos")
      .select("asaas_payment_id, pix_payload, invoice_url, valor, due_date")
      .eq("devedor_id", dev.id).eq("status", "pendente").eq("valor", valorFinal).eq("simulacao", simulacao)
      .gte("criado_em", new Date(Date.now() - 120000).toISOString())
      .order("criado_em", { ascending: false }).limit(1).maybeSingle();
    if (dup) {
      return json({ ok: true, simulacao, reutilizado: true, pagamento_id: dup.asaas_payment_id, valor_final: Number(dup.valor), desconto_pct: descontoPct, pix_copia_cola: dup.pix_payload, invoice_url: dup.invoice_url, valido_ate: String(dup.due_date).split("-").reverse().join("/") });
    }
  }

  const validadeDias = Number(asaasCfg.validade_proposta_dias ?? cfg.validade_proposta_dias ?? 7);
  const dueDate = new Date(Date.now() + validadeDias * 86400000).toISOString().slice(0, 10);
  const apiKey = ambiente === "producao" ? (seg.ASAAS_API_KEY_PROD ?? "") : (seg.ASAAS_API_KEY_SANDBOX ?? "");
  const podeAsaas = !!apiKey; // sem chave (ex.: teste sem sandbox) -> Pix fake

  const { data: neg } = await sb.from("negociacoes").insert({ devedor_id: dev.id, conversa_id: b.conversa_id ?? null, valor_original: dev.saldo, desconto_pct: descontoPct, valor_proposto: valorFinal, faixa_aplicada: prop.faixa_aplicada, desconto_extra_usado: extraAplicado, status: "aceita", validade: dueDate, simulacao }).select("id").single();

  let payId: string, pixPayload: string, pixImg: string | null, invoiceUrl: string | null, customerId: string | null = dev.asaas_customer_id ?? null;

  if (!podeAsaas) {
    payId = "TESTE-" + crypto.randomUUID().slice(0, 8);
    pixPayload = `PIX DE TESTE — NÃO PAGUE — gerado em modo teste no valor de R$ ${valorFinal} (proc. ${dev.processo ?? dev.id}).`;
    pixImg = null;
    invoiceUrl = null;
  } else {
    const asaas = new Asaas(apiKey, ambiente);
    const { data: tel } = await sb.from("telefones_devedor").select("telefone_e164").eq("devedor_id", dev.id).eq("tipo", "movel").order("ordem").limit(1).maybeSingle();
    const mobile = tel?.telefone_e164?.replace("+", "");
    customerId = customerId ?? await asaas.acharOuCriarCliente({ nome: dev.nome, cpfCnpj: dev.cpf_cnpj, mobilePhone: mobile, externalReference: String(dev.id) });
    if (!dev.asaas_customer_id && !simulacao) await sb.from("devedores").update({ asaas_customer_id: customerId }).eq("id", dev.id);
    const pay = await asaas.criarPix({ customer: customerId, value: valorFinal, dueDate, externalReference: String(neg?.id ?? dev.id), description: `Quitacao - processo ${dev.processo ?? dev.id}`, walletSavan: walletCredor, comissaoPct });
    const qr = await asaas.pixQrCode(pay.id);
    payId = pay.id; pixPayload = qr.payload; pixImg = qr.encodedImage ?? null; invoiceUrl = pay.invoiceUrl ?? null;
  }

  const comissao = Math.round(valorFinal * comissaoPct) / 100;
  await sb.from("pagamentos").insert({ negociacao_id: neg?.id ?? null, devedor_id: dev.id, asaas_payment_id: payId, asaas_customer_id: customerId, valor: valorFinal, comissao_operador: comissao, repasse_savan: Math.round((valorFinal - comissao) * 100) / 100, pix_payload: pixPayload, pix_qrcode_base64: pixImg, invoice_url: invoiceUrl, status: "pendente", due_date: dueDate, simulacao });

  await sb.from("devedores").update({ status_cobranca: "pix_gerado" }).eq("id", dev.id);
  if (b.conversa_id) await sb.from("conversas").update({ estado: "pix_enviado" }).eq("id", b.conversa_id);
  await sb.from("eventos_campanha").insert({ tipo: "pix_gerado", devedor_id: dev.id, carteira_id: dev.carteira_id ?? null, payload: { pagamento: payId, valor: valorFinal, desconto_pct: descontoPct, simulacao } });
  if (!simulacao) await sb.rpc("fn_inc_metrica_dia", { p_dia: new Date().toISOString().slice(0, 10), p_campo: "pix_gerados", p_n: 1 });

  if (dev.chatwoot_contact_id && !simulacao && customerId) {
    const cwUrl = cfg.chatwoot?.url ?? "https://chatwoot.example.com";
    const accId = cfg.chatwoot?.account_id ?? 1;
    await fetch(`${cwUrl}/api/v1/accounts/${accId}/contacts/${dev.chatwoot_contact_id}`, { method: "PUT", headers: { "api_access_token": seg.CHATWOOT_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ custom_attributes: { asaas_id_cliente: customerId, asaas_id_cobranca: payId, asaas_status_cobranca: "Pendente", desconto_oferecido: descontoPct } }) });
  }

  return json({ ok: true, simulacao, pagamento_id: payId, valor_final: valorFinal, desconto_pct: descontoPct, pix_copia_cola: pixPayload, invoice_url: invoiceUrl, valido_ate: dueDate.split("-").reverse().join("/") });
});
