// SAVAN Recupera — disparar-teste (self-contained; = deployada)
// Manda a 1ª mensagem do bot para um NÚMERO DE TESTE (configurado na tela de Chips), usando
// um chip escolhido, e cria a conversa marcada como simulacao=true. Assim a conversa
// "avança": você responde no seu WhatsApp e o bot negocia em modo teste (Pix sandbox/fake).
// Entrada: { chip_id, numero_e164? }  — numero_e164 escolhe qual número de teste recebe
// (precisa estar cadastrado em configuracoes.numero_teste). Sem ele, usa o primeiro ativo.
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
function spintax(t: string): string {
  let prev = "", cur = t;
  while (cur !== prev) { prev = cur; cur = cur.replace(/\{([^{}]*\|[^{}]*)\}/g, (_m, g) => { const o = g.split("|"); return o[Math.floor(Math.random() * o.length)]; }); }
  return cur;
}
function render(tpl: string, vars: Record<string, unknown>): string {
  let txt = spintax(tpl);
  txt = txt.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => { const v = vars[k]; return v === undefined || v === null ? "" : String(v); });
  return txt;
}

const CPF_TESTE = "00000000191";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();
  const seg = await carregarSegredos(sb);
  const cfg = await getConfig(sb);
  const b = await req.json();

  // números de teste: aceita o formato novo {numeros:[{e164,label,ativo}]} e o antigo {e164,ativo}
  const nt = cfg.numero_teste ?? {};
  const lista: { e164?: string; label?: string; ativo?: boolean }[] = Array.isArray(nt.numeros)
    ? nt.numeros
    : (nt.e164 ? [{ e164: nt.e164, ativo: nt.ativo }] : []);
  const pedido: string = (b.numero_e164 ?? "").trim();
  let numeroTeste = "";
  if (pedido) {
    const achou = lista.find((n) => (n.e164 ?? "").trim() === pedido);
    if (!achou) return json({ ok: false, erro: "numero_nao_cadastrado", detalhe: "Esse número de teste não está salvo. Cadastre e salve na tela de Chips." }, 400);
    numeroTeste = pedido;
  } else {
    numeroTeste = ((lista.find((n) => n.ativo) ?? lista[0])?.e164 ?? "").trim();
  }
  if (!numeroTeste) return json({ ok: false, erro: "numero_teste_ausente", detalhe: "Defina um número de teste na tela de Chips antes de disparar." }, 400);

  const { data: chip } = await sb.from("chips").select("id, nome, chatwoot_inbox_id, status").eq("id", b.chip_id).maybeSingle();
  if (!chip) return json({ ok: false, erro: "chip_nao_encontrado" }, 404);
  if (!chip.chatwoot_inbox_id) return json({ ok: false, erro: "chip_sem_inbox", detalhe: "Este chip ainda não está vinculado ao Chatwoot." }, 400);
  if (!["conectado", "aquecendo", "ativo"].includes(chip.status)) return json({ ok: false, erro: "chip_offline", detalhe: "Conecte o chip (QR) antes de testar." }, 400);

  // carteira de teste (find-or-create)
  let { data: cart } = await sb.from("carteiras").select("id, credor").eq("nome", "🧪 Carteira de teste").maybeSingle();
  if (!cart) {
    const ins = await sb.from("carteiras").insert({ nome: "🧪 Carteira de teste", credor: "Teste", status: "ativa", descricao: "Carteira interna para testar o bot (modo teste)." }).select("id, credor").single();
    cart = ins.data;
  }
  const carteiraId = cart!.id;

  // devedor de teste (find-or-create) com dívida antiga p/ gerar desconto
  let { data: dev } = await sb.from("devedores").select("id, nome, processo, saldo, chatwoot_contact_id").eq("carteira_id", carteiraId).eq("cpf_cnpj", CPF_TESTE).maybeSingle();
  if (!dev) {
    const ins = await sb.from("devedores").insert({ carteira_id: carteiraId, cpf_cnpj: CPF_TESTE, nome: "Teste (voce)", saldo: 1000, vencimento: "2009-01-10", processo: "TESTE-0001", status_cobranca: "pendente" }).select("id, nome, processo, saldo, chatwoot_contact_id").single();
    dev = ins.data;
  }

  // telefone de teste (find-or-create)
  let { data: tel } = await sb.from("telefones_devedor").select("id").eq("devedor_id", dev!.id).eq("telefone_e164", numeroTeste).maybeSingle();
  if (!tel) {
    const ins = await sb.from("telefones_devedor").insert({ devedor_id: dev!.id, telefone_e164: numeroTeste, tipo: "movel", ordem: 1 }).select("id").single();
    tel = ins.data;
  }

  // cria contato + conversa no Chatwoot (reaproveita contato-criar)
  const ccR = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/contato-criar`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inbox_id: chip.chatwoot_inbox_id, telefone_e164: numeroTeste, telefone_id: tel!.id, devedor_id: dev!.id, devedor_nome: dev!.nome, processo: dev!.processo, valor_divida: dev!.saldo }),
  });
  const cc = await ccR.json();
  if (!cc?.ok || !cc?.exists || !cc?.conversation_id) {
    return json({ ok: false, erro: "sem_whatsapp_teste", detalhe: "O número de teste não tem WhatsApp ativo ou o chip não respondeu. Confira o número e a conexão do chip." }, 400);
  }
  const conversationId = cc.conversation_id;

  // mensagem de abertura (template real, se houver)
  const { data: tpls } = await sb.from("templates_mensagem").select("id, conteudo").eq("tipo", "abordagem_inicial").eq("ativo", true).limit(1);
  const nomeBot = cfg.ia?.nome_bot ?? "Ana";
  const primeiroNome = String(dev!.nome ?? "").split(" ")[0];
  const conteudo = tpls && tpls.length
    ? render(tpls[0].conteudo, { primeiro_nome: primeiroNome, nome_bot: nomeBot, nome: dev!.nome, credor: cart!.credor ?? "" })
    : `Olá ${primeiroNome}, aqui é a ${nomeBot}. [MENSAGEM DE TESTE] Podemos falar rapidinho sobre uma pendência antiga?`;

  const cwUrl = cfg.chatwoot?.url ?? "https://chatwoot.example.com";
  const acc = cfg.chatwoot?.account_id ?? 1;
  await fetch(`${cwUrl}/api/v1/accounts/${acc}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "api_access_token": seg.CHATWOOT_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ content: conteudo, message_type: "outgoing" }),
  });

  // cria/atualiza a conversa marcada como teste
  await sb.from("conversas").upsert({
    devedor_id: dev!.id, carteira_id: carteiraId, chip_id: chip.id, telefone_id: tel!.id,
    chatwoot_conversation_id: conversationId, chatwoot_contact_id: cc.contact_id ?? null,
    estado: "aguardando_resposta", ultima_msg_em: new Date().toISOString(), ultima_msg_de: "bot",
    simulacao: true,
  }, { onConflict: "chatwoot_conversation_id" });
  const { data: convRow } = await sb.from("conversas").select("id").eq("chatwoot_conversation_id", conversationId).maybeSingle();
  if (convRow) await sb.from("mensagens").insert({ conversa_id: convRow.id, direcao: "saida", origem: "bot", conteudo, simulacao: true });

  return json({ ok: true, conversation_id: conversationId, numero_teste: numeroTeste, mensagem: conteudo });
});
