// SAVAN Recupera — gerar-pix
// Cria (ou reaproveita) o cliente Asaas, gera a cobrança Pix com split 90/10
// e grava negociação + pagamento. Retorna o copia-e-cola para o bot enviar.
// Entrada: { devedor_id, conversa_id?, desconto_pct?, valor_final? }  (se ausentes usa fn_proposta)
import { admin, carregarSegredos, getConfig, json, cors } from "../_shared/lib.ts";
import { Asaas } from "../_shared/asaas.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();
  await carregarSegredos(sb);
  const cfg = await getConfig(sb);
  const b = await req.json();

  const { data: dev } = await sb.from("devedores")
    .select("id, nome, cpf_cnpj, processo, saldo, carteira_id, asaas_customer_id, chatwoot_contact_id")
    .eq("id", b.devedor_id).single();
  if (!dev) return json({ ok: false, erro: "devedor_nao_encontrado" }, 404);

  // proposta (números vêm do banco, nunca do LLM)
  const { data: prop } = await sb.rpc("fn_proposta", { p_devedor_id: dev.id });
  const descontoPct = b.desconto_pct ?? prop.desconto_pct;
  const valorFinal = b.valor_final ?? prop.valor_final;

  // override de Asaas (wallet/comissão) por carteira, com fallback global
  let cartAsaas: any = {};
  if (dev.carteira_id) {
    const { data: cart } = await sb.from("carteiras").select("config_override").eq("id", dev.carteira_id).maybeSingle();
    cartAsaas = cart?.config_override?.asaas ?? {};
  }
  const asaasCfg = { ...(cfg.asaas ?? {}), ...cartAsaas };
  const ambiente = asaasCfg.ambiente === "producao" ? "producao" : "sandbox";
  const apiKey = ambiente === "producao"
    ? Deno.env.get("ASAAS_API_KEY_PROD") ?? ""
    : Deno.env.get("ASAAS_API_KEY_SANDBOX") ?? "";
  const asaas = new Asaas(apiKey, ambiente);

  // telefone móvel principal
  const { data: tel } = await sb.from("telefones_devedor")
    .select("telefone_e164").eq("devedor_id", dev.id).eq("tipo", "movel")
    .order("ordem").limit(1).maybeSingle();
  const mobile = tel?.telefone_e164?.replace("+", "");

  const customerId = dev.asaas_customer_id ?? await asaas.acharOuCriarCliente({
    nome: dev.nome,
    cpfCnpj: dev.cpf_cnpj,
    mobilePhone: mobile,
    externalReference: String(dev.id),
  });
  if (!dev.asaas_customer_id) {
    await sb.from("devedores").update({ asaas_customer_id: customerId }).eq("id", dev.id);
  }

  const validadeDias = Number(cfg.validade_proposta_dias ?? 7);
  const dueDate = new Date(Date.now() + validadeDias * 86400000).toISOString().slice(0, 10);
  const comissaoPct = Number(asaasCfg.comissao_pct ?? 10);

  // grava negociação
  const { data: neg } = await sb.from("negociacoes").insert({
    devedor_id: dev.id,
    conversa_id: b.conversa_id ?? null,
    valor_original: dev.saldo,
    desconto_pct: descontoPct,
    valor_proposto: valorFinal,
    faixa_aplicada: prop.faixa_aplicada,
    desconto_extra_usado: b.desconto_extra ?? false,
    status: "aceita",
    validade: dueDate,
  }).select("id").single();

  const pay = await asaas.criarPix({
    customer: customerId,
    value: valorFinal,
    dueDate,
    externalReference: String(neg?.id ?? dev.id),
    description: `Quitacao - processo ${dev.processo}`,
    walletSavan: asaasCfg.wallet_savan || undefined,
    comissaoPct,
  });
  const qr = await asaas.pixQrCode(pay.id);

  const comissao = Math.round(valorFinal * comissaoPct) / 100;
  await sb.from("pagamentos").insert({
    negociacao_id: neg?.id ?? null,
    devedor_id: dev.id,
    asaas_payment_id: pay.id,
    asaas_customer_id: customerId,
    valor: valorFinal,
    comissao_operador: comissao,
    repasse_savan: Math.round((valorFinal - comissao) * 100) / 100,
    pix_payload: qr.payload,
    pix_qrcode_base64: qr.encodedImage,
    invoice_url: pay.invoiceUrl,
    status: "pendente",
    due_date: dueDate,
  });

  await sb.from("devedores").update({ status_cobranca: "pix_gerado" }).eq("id", dev.id);
  if (b.conversa_id) {
    await sb.from("conversas").update({ estado: "pix_enviado" }).eq("id", b.conversa_id);
  }
  await sb.from("eventos_campanha").insert({
    tipo: "pix_gerado", devedor_id: dev.id, carteira_id: dev.carteira_id ?? null,
    payload: { pagamento: pay.id, valor: valorFinal, desconto_pct: descontoPct },
  });
  await sb.rpc("fn_inc_metrica_dia", {
    p_dia: new Date().toISOString().slice(0, 10), p_campo: "pix_gerados", p_n: 1,
  });

  // atualiza atributos no Chatwoot
  if (dev.chatwoot_contact_id) {
    const cwUrl = cfg.chatwoot?.url ?? "https://chatwoot.example.com";
    const acc = cfg.chatwoot?.account_id ?? 1;
    await fetch(`${cwUrl}/api/v1/accounts/${acc}/contacts/${dev.chatwoot_contact_id}`, {
      method: "PUT",
      headers: { "api_access_token": Deno.env.get("CHATWOOT_TOKEN")!, "Content-Type": "application/json" },
      body: JSON.stringify({
        custom_attributes: {
          asaas_id_cliente: customerId,
          asaas_id_cobranca: pay.id,
          asaas_status_cobranca: "Pendente",
          desconto_oferecido: descontoPct,
        },
      }),
    });
  }

  return json({
    ok: true,
    pagamento_id: pay.id,
    valor_final: valorFinal,
    desconto_pct: descontoPct,
    pix_copia_cola: qr.payload,
    invoice_url: pay.invoiceUrl,
    valido_ate: dueDate.split("-").reverse().join("/"),
  });
});
