// SAVAN Recupera — disparar-teste (self-contained; = deployada)
// Manda a 1ª mensagem do bot para um NÚMERO DE TESTE (configurado na tela de Chips), usando
// um chip escolhido, e cria a conversa marcada como simulacao=true. Assim a conversa
// "avança": você responde no seu WhatsApp e o bot negocia em modo teste (Pix sandbox/fake).
// Entrada: { chip_id, numero_e164? }  — numero_e164 escolhe qual número de teste recebe
// (precisa estar cadastrado em configuracoes.numero_teste). Sem ele, usa o primeiro ativo.
// SEGURANÇA (auditoria 2026-06-26): A1 — só o service_role (rota /api/chips/teste) pode chamar.
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

// ─── Templates aprovados da Meta (§32) ────────────────────────────────────────────────────────
// Fora da janela de 24h a Cloud API recusa texto livre: só sai MODELO APROVADO. Estas funcoes
// resolvem o template no cache local (meta_templates), rendem o corpo com as variaveis e montam
// o payload do Chatwoot. O `content` vai com o texto ja renderizado — assim o historico do painel
// e do atendente mostra exatamente o que a pessoa recebeu, e nao um placeholder.
type TplMeta = { name: string; language: string; category: string; params: string[]; texto: string };

function corpoDoTemplate(components: unknown): string {
  const lista = Array.isArray(components) ? components : [];
  const body = lista.find((c: any) => c?.type === "BODY");
  return String((body as any)?.text ?? "");
}

async function montarTemplate(
  sb: SupabaseClient, cobradorId: string | null, ref: any, vars: Record<string, string>,
): Promise<TplMeta | null> {
  const name = String(ref?.name ?? "").trim();
  if (!name) return null;
  const language = String(ref?.language ?? "pt_BR");
  let q = sb.from("meta_templates").select("name, language, category, components")
    .eq("name", name).eq("language", language).eq("status", "APPROVED");
  if (cobradorId) q = q.eq("cobrador_id", cobradorId);
  const { data } = await q.maybeSingle();
  if (!data) return null;

  const nomes: string[] = Array.isArray(ref?.variaveis) ? ref.variaveis : [];
  const params = nomes.map((v) => String(vars[v] ?? "").trim());
  // A Meta recusa parametro vazio; sem valor para uma posicao, o template nao pode ser usado.
  if (params.some((p) => !p)) return null;
  let texto = corpoDoTemplate(data.components);
  params.forEach((p, i) => { texto = texto.replaceAll(`{{${i + 1}}}`, p); });
  return {
    name: data.name, language: data.language,
    category: String(data.category ?? "UTILITY").toLowerCase(), params, texto,
  };
}

// Payload de mensagem do Chatwoot para um canal WhatsApp Cloud enviando modelo aprovado.
function chatwootTemplateBody(tpl: TplMeta) {
  return {
    content: tpl.texto,
    message_type: "outgoing",
    template_params: {
      name: tpl.name,
      category: tpl.category,
      language: tpl.language,
      processed_params: Object.fromEntries(tpl.params.map((p, i) => [String(i + 1), p])),
    },
  };
}

const CPF_TESTE = "00000000191";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // A1: somente o service_role (rota /api/chips/teste) pode chamar. A anon key pública é recusada.
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
  if (!["conectado", "aquecendo", "ativo"].includes(chip.status)) return json({ ok: false, erro: "chip_offline", detalhe: "Este numero nao esta conectado na Meta. Confira as credenciais em Ajustes > Chips." }, 400);

  // Carteira do teste: a que o painel pedir (para testar o fluxo DELA) ou a carteira interna de
  // teste. A interna nasce com o fluxo-modelo — assim o teste mostra o mesmo texto que uma carteira
  // recém-configurada mandaria, em vez de um texto que não existe em lugar nenhum (§35).
  let cart: { id: number; credor: string | null; roteiro: any } | null = null;
  if (b.carteira_id) {
    const { data } = await sb.from("carteiras").select("id, credor, roteiro").eq("id", b.carteira_id).maybeSingle();
    cart = data;
  }
  if (!cart) {
    const { data } = await sb.from("carteiras").select("id, credor, roteiro").eq("nome", "🧪 Carteira de teste").maybeSingle();
    cart = data;
    if (!cart) {
      const { data: modelo } = await sb.from("configuracoes").select("valor")
        .eq("chave", "roteiro_modelo").is("cobrador_id", null).maybeSingle();
      const ins = await sb.from("carteiras").insert({
        nome: "🧪 Carteira de teste", credor: "Teste", status: "ativa",
        descricao: "Carteira interna para testar o bot (modo teste).",
        roteiro: modelo?.valor ?? null,
      }).select("id, credor, roteiro").single();
      cart = ins.data;
    }
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
  // Repassa o JWT service_role ja validado nesta requisicao. O segredo interno pode usar o
  // formato `sb_secret_...` (nao JWT) e era rejeitado pela trava A1 da funcao chamada.
  const authRecebida = req.headers.get("Authorization") ?? "";
  const ccR = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/contato-criar`, {
    method: "POST",
    headers: { "Authorization": authRecebida, "Content-Type": "application/json" },
    body: JSON.stringify({ inbox_id: chip.chatwoot_inbox_id, telefone_e164: numeroTeste, telefone_id: tel!.id, devedor_id: dev!.id, devedor_nome: dev!.nome, processo: dev!.processo, valor_divida: dev!.saldo, teste_real: true }),
  });
  const cc = await ccR.json().catch(() => null);
  if (!cc?.ok) {
    return json({
      ok: false,
      erro: cc?.erro ?? "contato_criar_falhou",
      detalhe: "Nao foi possivel criar o contato/conversa de teste no Chatwoot.",
      status_provedor: cc?.status_provedor ?? ccR.status,
    }, 400);
  }
  if (!cc?.ok || !cc?.exists || !cc?.conversation_id) {
    return json({ ok: false, erro: "sem_whatsapp_teste", detalhe: "O número de teste não tem WhatsApp ativo ou o chip não respondeu. Confira o número e a conexão do chip." }, 400);
  }
  const conversationId = cc.conversation_id;

  // mensagem de abertura: o bloco de disparo do fluxo desta carteira (§35); sem fluxo, o template
  const blocoDisparo = (cart!.roteiro?.etapas ?? []).find((e: any) => e?.tipo === "disparo");
  const variacoes: string[] = (blocoDisparo?.textos ?? []).map((t: unknown) => String(t ?? "").trim()).filter(Boolean);
  let bruto: string | null = variacoes.length ? variacoes[Math.floor(Math.random() * variacoes.length)] : null;
  if (!bruto) {
    const { data: tpls } = await sb.from("templates_mensagem").select("id, conteudo").eq("tipo", "abordagem_inicial").eq("ativo", true).limit(1);
    bruto = tpls && tpls.length ? tpls[0].conteudo : null;
  }
  const nomeBot = cfg.ia?.nome_bot ?? "Ana";
  const primeiroNome = String(dev!.nome ?? "").split(" ")[0];
  const conteudo = bruto
    ? render(bruto, { primeiro_nome: primeiroNome, nome_bot: nomeBot, nome: dev!.nome, credor: cart!.credor ?? "" })
    : `Olá ${primeiroNome}, aqui é a ${nomeBot}. [MENSAGEM DE TESTE] Podemos falar rapidinho sobre uma pendência antiga?`;

  // A 1a mensagem abre a conversa: fora da janela de 24h a Cloud API so aceita modelo aprovado.
  // O teste usa o MESMO caminho da campanha de verdade — se ele chegar, a campanha chega.
  const { data: chipDono } = await sb.from("chips").select("cobrador_id").eq("id", chip.id).maybeSingle();
  const tplMeta = await montarTemplate(sb, chipDono?.cobrador_id ?? null, cfg.meta_abordagem_template, {
    primeiro_nome: primeiroNome, nome: dev!.nome ?? "", credor: cart!.credor ?? "", nome_bot: nomeBot,
  });
  if (!tplMeta) {
    return json({
      ok: false, erro: "template_indisponivel",
      detalhe: "A 1a mensagem precisa de um modelo APROVADO pela Meta. Confira em Ajustes > Integracoes se o template da abordagem ja saiu de 'em analise'.",
    }, 400);
  }
  const conteudoFinal = tplMeta.texto;

  const cwUrl = cfg.chatwoot?.url ?? "https://chatwoot.example.com";
  const acc = cfg.chatwoot?.account_id ?? 1;
  const envio = await fetch(`${cwUrl}/api/v1/accounts/${acc}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "api_access_token": seg.CHATWOOT_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(chatwootTemplateBody(tplMeta)),
  });
  if (!envio.ok) {
    const det = await envio.text().catch(() => "");
    return json({ ok: false, erro: "falha_envio", detalhe: `O Chatwoot recusou o envio do modelo (${envio.status}). ${det.slice(0, 300)}` }, 400);
  }

  // cria/atualiza a conversa marcada como teste
  await sb.from("conversas").upsert({
    devedor_id: dev!.id, carteira_id: carteiraId, chip_id: chip.id, telefone_id: tel!.id,
    chatwoot_conversation_id: conversationId, chatwoot_contact_id: cc.contact_id ?? null,
    estado: "aguardando_resposta", ultima_msg_em: new Date().toISOString(), ultima_msg_de: "bot",
    simulacao: true,
  }, { onConflict: "chatwoot_conversation_id" });
  const { data: convRow } = await sb.from("conversas").select("id").eq("chatwoot_conversation_id", conversationId).maybeSingle();
  if (convRow) await sb.from("mensagens").insert({ conversa_id: convRow.id, direcao: "saida", origem: "bot", conteudo: conteudoFinal, simulacao: true });

  return json({ ok: true, conversation_id: conversationId, numero_teste: numeroTeste, mensagem: conteudoFinal, template: tplMeta.name });
});
