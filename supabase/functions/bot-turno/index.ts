// SAVAN Recupera — bot-turno (cérebro do bot negociador, OpenAI function calling)
// Prompt (persona/contexto/guardrails) vem do banco: padrão global em `configuracoes`
// e, opcionalmente, override por carteira. Configurável pelo painel.
// Modo teste: herda conversas.simulacao -> não suja métricas reais, passa flag ao gerar-pix.
// SEGURANÇA (auditoria 2026-06-26): A1 — só o service_role (n8n W02) pode chamar; anon key recusada (401).
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const OPENAI = "https://api.openai.com/v1/chat/completions";
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
const CHAVES_POR_COBRADOR = new Set(["campanha_ativa", "modo_simulacao", "janela_envio", "intervalo_min_segundos", "aquecimento", "faixas_desconto", "ia"]);
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
async function getConfig(sb: SupabaseClient, cobradorId: string | null = null) {
  const { data: glob } = await sb.from("configuracoes").select("chave, valor").is("cobrador_id", null);
  const c: Record<string, any> = {};
  for (const r of glob ?? []) c[r.chave] = r.valor;
  if (cobradorId) {
    const { data: own } = await sb.from("configuracoes").select("chave, valor").eq("cobrador_id", cobradorId);
    for (const r of own ?? []) if (CHAVES_POR_COBRADOR.has(r.chave)) c[r.chave] = r.valor;
  }
  return c;
}
async function getCarteira(sb: SupabaseClient, id: number | null) {
  if (!id) return null;
  const { data } = await sb.from("carteiras")
    .select("id, nome, credor, status, cobrador_id, prompt_persona, contexto_negocio, guardrails, config_override")
    .eq("id", id).maybeSingle();
  return data;
}

function lerEscaladores(carteira: any, cfg: any): { estrategia: string; lista: any[] } {
  const esc = carteira?.config_override?.escaladores;
  if (esc && Array.isArray(esc.lista) && esc.lista.length) {
    return { estrategia: esc.estrategia ?? "fixo", lista: esc.lista };
  }
  const antigo = carteira?.config_override?.equipe || cfg.equipe_padrao || null;
  if (antigo && (antigo.chip_id || antigo.numero)) return { estrategia: "fixo", lista: [antigo] };
  return { estrategia: "fixo", lista: [] };
}

async function escolherEscalador(sb: SupabaseClient, carteira: any, cfg: any, devedorId: number) {
  const { estrategia, lista } = lerEscaladores(carteira, cfg);
  if (!lista.length) return null;
  const chipIds = lista.map((e: any) => e.chip_id).filter(Boolean);
  const porId: Record<number, any> = {};
  if (chipIds.length) {
    const { data: chips } = await sb.from("chips")
      .select("id, nome, agente_nome, numero_e164, status, regiao_uf, regiao_cidade").in("id", chipIds);
    for (const c of chips ?? []) porId[c.id] = c;
  }
  const cand = lista.map((e: any) => {
    const c = e.chip_id ? porId[e.chip_id] : null;
    return {
      chip_id: e.chip_id ?? null,
      nome: e.nome || c?.agente_nome || c?.nome || null,
      numero: c?.numero_e164 || e.numero || null,
      status: c?.status ?? null,
      regiao_uf: (c?.regiao_uf ?? []) as string[],
      regiao_cidade: (c?.regiao_cidade ?? []) as string[],
    };
  }).filter((e) => e.numero);
  if (!cand.length) return null;
  const pick = (e: any) => ({ chip_id: e.chip_id, nome: e.nome, numero: e.numero });
  const disponivel = (e: any) => !["desconectado", "banido"].includes(String(e.status));
  const livres = cand.filter(disponivel);
  const pool = livres.length ? livres : cand;

  const rodizio = async (grupo: any[]) => {
    const ids = grupo.map((e) => e.chip_id).filter(Boolean);
    const carga: Record<number, number> = {};
    if (ids.length) {
      const { data } = await sb.from("escalacoes").select("equipe_chip_id")
        .in("equipe_chip_id", ids).in("status", ["aberta", "em_atendimento"]);
      for (const r of data ?? []) if (r.equipe_chip_id) carga[r.equipe_chip_id] = (carga[r.equipe_chip_id] ?? 0) + 1;
    }
    let melhor = grupo[0]; let min = Infinity;
    for (const e of grupo) { const n = e.chip_id ? (carga[e.chip_id] ?? 0) : 0; if (n < min) { min = n; melhor = e; } }
    return pick(melhor);
  };

  if (estrategia === "regiao") {
    const { data: dev } = await sb.from("devedores").select("uf, cidade").eq("id", devedorId).maybeSingle();
    const uf = String(dev?.uf ?? "").toUpperCase();
    const cidade = String(dev?.cidade ?? "").toLowerCase();
    const naRegiao = pool.filter((e) =>
      (uf && e.regiao_uf.map((x) => String(x).toUpperCase()).includes(uf)) ||
      (cidade && e.regiao_cidade.map((x) => String(x).toLowerCase()).includes(cidade)));
    return await rodizio(naRegiao.length ? naRegiao : pool);
  }
  if (estrategia === "fixo") return pick(pool[0]);
  return await rodizio(pool);
}

async function resolverConversaPorEntrada(sb: SupabaseClient, cfg: any, seg: Record<string, string>, convId: number) {
  const cwUrl = cfg.chatwoot?.url;
  const cwAcc = cfg.chatwoot?.account_id ?? 1;
  if (!cwUrl || !seg.CHATWOOT_TOKEN) return null;

  let inboxId: number | null = null;
  let fone = "";
  let lid: string | null = null;
  try {
    const r = await fetch(`${cwUrl}/api/v1/accounts/${cwAcc}/conversations/${convId}`, {
      headers: { "api_access_token": seg.CHATWOOT_TOKEN },
    });
    const d = await r.json();
    inboxId = d?.inbox_id ?? d?.meta?.sender?.inbox_id ?? null;
    fone = String(d?.meta?.sender?.phone_number ?? "").replace(/\D/g, "");
    const ident = String(d?.meta?.sender?.identifier ?? "");
    lid = ident.endsWith("@lid") ? ident : null;
  } catch { return null; }

  let chipId: number | null = null;
  if (inboxId) {
    const { data: chip } = await sb.from("chips").select("id").eq("chatwoot_inbox_id", inboxId).maybeSingle();
    chipId = chip?.id ?? null;
  }

  let devedorId: number | null = null;
  if (lid) {
    const { data: tl } = await sb.from("telefones_devedor").select("devedor_id").eq("chat_lid", lid).limit(2);
    const ids = [...new Set((tl ?? []).map((t: any) => t.devedor_id))];
    if (ids.length === 1) devedorId = ids[0];
  }
  if (!devedorId && fone.length >= 8) {
    const cauda = fone.slice(-8);
    const { data: tels } = await sb.from("telefones_devedor").select("devedor_id").ilike("telefone_e164", `%${cauda}`);
    const ids = [...new Set((tels ?? []).map((t: any) => t.devedor_id))];
    if (ids.length === 1) devedorId = ids[0];
  }

  let q = sb.from("conversas")
    .select("id, devedor_id, carteira_id, estado, chip_id, simulacao, telefone_id")
    .in("estado", ["aguardando_resposta", "bot_ativo"])
    .order("ultima_msg_em", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(5);
  if (devedorId) q = q.eq("devedor_id", devedorId);
  else if (chipId) q = q.eq("chip_id", chipId);
  const { data: cands } = await q;
  if (!cands || cands.length === 0) return null;

  let alvo: any = null;
  if (devedorId) alvo = cands[0];
  else if (cands.length === 1) alvo = cands[0];
  else alvo = cands.find((c: any) => c.simulacao === true) ?? null;
  if (!alvo) return null;

  await sb.from("conversas").update({ chatwoot_conversation_id: convId }).eq("id", alvo.id);
  console.log(`bot-turno auto-cura: conversa ${alvo.id} vinculada ao chatwoot_conversation_id ${convId} (devedor ${alvo.devedor_id}, fone_entrada=${fone || "n/d"})`);
  return alvo;
}

async function infoRemetente(cfg: any, seg: Record<string, string>, convId: number): Promise<{ lid: string | null; phone: string | null } | null> {
  const cwUrl = cfg.chatwoot?.url;
  const cwAcc = cfg.chatwoot?.account_id ?? 1;
  if (!cwUrl || !seg.CHATWOOT_TOKEN) return null;
  try {
    const r = await fetch(`${cwUrl}/api/v1/accounts/${cwAcc}/conversations/${convId}`, {
      headers: { "api_access_token": seg.CHATWOOT_TOKEN },
    });
    const d = await r.json();
    const s = d?.meta?.sender ?? {};
    const ident = String(s.identifier ?? "");
    return { lid: ident.endsWith("@lid") ? ident : null, phone: s.phone_number ?? null };
  } catch { return null; }
}

function montarSystemPrompt(cfg: any, carteira: any, prop: any): string {
  const nomeBot = cfg.ia?.nome_bot ?? "Ana";
  const primeiroNome = prop?.primeiro_nome ?? "a pessoa";
  const interp = (t: unknown) =>
    String(t ?? "").replaceAll("{{nome_bot}}", nomeBot).replaceAll("{{primeiro_nome}}", primeiroNome);
  const persona = carteira?.prompt_persona || cfg.bot_persona ||
    "Você é {{nome_bot}}, uma assistente de negociação simpática e objetiva. Seu objetivo é oferecer a QUITAÇÃO VOLUNTÁRIA de uma pendência antiga com desconto.";
  const contexto = carteira?.contexto_negocio || cfg.bot_contexto ||
    "Você atende em nome do credor responsável pela cobrança.";
  const g = carteira?.guardrails || cfg.bot_guardrails || {};
  const regras: string[] = [];
  const nuncaCitar = Array.isArray(g.nunca_citar) ? g.nunca_citar : [];
  if (nuncaCitar.length) regras.push(`NUNCA mencione ${nuncaCitar.join(", ")}, nem QUALQUER consequência por não pagar.`);
  regras.push("NUNCA invente valores. Use SOMENTE os números retornados pela tool consultar_divida.");
  if (g.responder_prescricao_honestamente !== false) regras.push("Se perguntarem sobre prescrição ou se ainda precisa pagar: responda com honestidade que, por ser dívida antiga, pode estar prescrita e o pagamento é voluntário; a proposta é um encerramento definitivo com termo de quitação. Nunca pressione.");
  if (g.confirmar_identidade !== false) regras.push(`CONFIRME A IDENTIDADE antes de revelar qualquer dado. Pergunte se fala com ${primeiroNome}. Se não for a pessoa / número errado: peça desculpas, chame a tool pessoa_errada e encerre. NUNCA revele CPF, valor da dívida ou outros dados antes da confirmação.`);
  regras.push("Se pedir para não ser mais contatada: chame a tool nao_perturbe, confirme educadamente e encerre.");
  regras.push("Se contestar a dívida, não reconhecer, citar advogado/Procon/justiça, ou for hostil: chame a tool escalar_humano.");
  const maxRodadas = Number(g.max_rodadas_desconto ?? 1);
  regras.push(`Desconto extra: no máximo ${maxRodadas} vez(es), e somente após recusa explícita da primeira proposta. Use a tool desconto_extra. Nunca ofereça abaixo do valor mínimo.`);
  if (g.regras_extras) regras.push(String(g.regras_extras));
  const tom = g.tom || "humano, caloroso, brasileiro, frases curtas, no máximo 2 perguntas por vez e 1 emoji por mensagem";
  return [
    interp(persona), interp(contexto), "",
    "REGRAS INEGOCIÁVEIS (violar qualquer uma é falha grave):",
    ...regras.map((r, i) => `${i + 1}. ${interp(r)}`), "",
    "FLUXO IDEAL: confirmar identidade -> contextualizar -> consultar_divida -> apresentar proposta (valor, desconto, validade) -> tratar objeções -> gerar_pix -> orientar pagamento -> avisar que após o pagamento envia o termo de quitação.", "",
    `ESTILO: ${interp(tom)}. Não soe robótica.`,
  ].join("\n");
}

function tools() {
  return [
    { type: "function", function: { name: "consultar_divida", description: "Retorna os números oficiais da dívida e a proposta. Use SEMPRE antes de citar qualquer valor.", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "gerar_pix", description: "Gera o Pix de quitação quando a pessoa aceitar. Retorna o copia-e-cola.", parameters: { type: "object", properties: { desconto_extra: { type: "boolean" } }, required: [] } } },
    { type: "function", function: { name: "desconto_extra", description: "Aplica UMA única margem extra de desconto, após recusa explícita da primeira proposta.", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "escalar_humano", description: "Transfere para atendente humano (contestação, advogado, hostilidade).", parameters: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] } } },
    { type: "function", function: { name: "nao_perturbe", description: "Registra que a pessoa não quer mais ser contatada e encerra.", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "pessoa_errada", description: "Registra que o número não pertence à pessoa procurada e encerra.", parameters: { type: "object", properties: {}, required: [] } } },
  ];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // A1: somente o service_role (n8n W02) pode chamar. A anon key pública é recusada.
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
  let seg = await carregarSegredos(sb);
  let cfg = await getConfig(sb);
  const b = await req.json();
  const convId = b.chatwoot_conversation_id;

  let { data: conv } = await sb.from("conversas").select("id, devedor_id, carteira_id, estado, chip_id, simulacao, telefone_id").eq("chatwoot_conversation_id", convId).maybeSingle();
  if (!conv) {
    conv = await resolverConversaPorEntrada(sb, cfg, seg, convId);
    if (!conv) return json({ ok: false, erro: "conversa_desconhecida" }, 404);
  }
  const simulacao = conv.simulacao === true;

  if (conv.estado === "humano") {
    await sb.from("mensagens").insert({ conversa_id: conv.id, direcao: "entrada", origem: "devedor", conteudo: b.mensagem, simulacao });
    await sb.from("conversas").update({ ultima_msg_em: new Date().toISOString(), ultima_msg_de: "devedor" }).eq("id", conv.id);
    return json({ ok: true, acao: "humano", mensagens: [] });
  }

  const { data: prop } = await sb.rpc("fn_proposta", { p_devedor_id: conv.devedor_id });

  let carteiraId = conv.carteira_id;
  if (!carteiraId) {
    const { data: d } = await sb.from("devedores").select("carteira_id").eq("id", conv.devedor_id).maybeSingle();
    carteiraId = d?.carteira_id ?? null;
  }
  const carteira = await getCarteira(sb, carteiraId);
  const cobradorId = carteira?.cobrador_id ?? null;
  cfg = await getConfig(sb, cobradorId);
  seg = await carregarSegredos(sb, cobradorId);
  let equipe: { chip_id: number | null; nome: string | null; numero: string | null } | null = null;

  const { data: convsDev } = await sb.from("conversas").select("id").eq("devedor_id", conv.devedor_id);
  const convIds = (convsDev ?? []).map((c) => c.id);
  const { data: histRaw } = await sb.from("mensagens").select("origem, direcao, conteudo").in("conversa_id", convIds.length ? convIds : [conv.id]).order("criado_em", { ascending: false }).limit(20);
  const hist = (histRaw ?? []).reverse();
  const messages: any[] = [{ role: "system", content: montarSystemPrompt(cfg, carteira, prop) }];
  for (const m of hist) messages.push({ role: m.direcao === "entrada" ? "user" : "assistant", content: m.conteudo ?? "" });
  messages.push({ role: "user", content: b.mensagem ?? "" });

  await sb.from("mensagens").insert({ conversa_id: conv.id, direcao: "entrada", origem: "devedor", conteudo: b.mensagem, simulacao });
  await sb.from("conversas").update({ estado: "bot_ativo", ultima_msg_em: new Date().toISOString(), ultima_msg_de: "devedor", proximo_followup_em: null }).eq("id", conv.id);
  await sb.from("eventos_campanha").insert({ tipo: "resposta", devedor_id: conv.devedor_id, carteira_id: carteiraId, payload: { simulacao } });
  if (!simulacao) await sb.rpc("fn_inc_metrica_dia", { p_dia: new Date().toISOString().slice(0, 10), p_campo: "respostas", p_n: 1 });

  const apiKey = seg.OPENAI_API_KEY;
  if (!apiKey) return json({ ok: false, erro: "openai_key_ausente" }, 500);
  const modelo = cfg.ia?.modelo ?? "gpt-4.1-mini";

  const respostas: string[] = [];
  let acao = "responder";
  let escalarMotivo: string | null = null;
  let escalarResumo: string | null = null;
  let encerrar = false;

  for (let passo = 0; passo < 5; passo++) {
    const r = await fetch(OPENAI, { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: modelo, messages, tools: tools(), temperature: 0.7 }) });
    const data = await r.json();
    const msg = data?.choices?.[0]?.message;
    if (!msg) break;
    messages.push(msg);
    if (!msg.tool_calls || msg.tool_calls.length === 0) { if (msg.content) respostas.push(msg.content); break; }

    for (const tc of msg.tool_calls) {
      const nome = tc.function.name;
      let args: any = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /**/ }
      let resultado: any = { ok: true };
      if (nome === "consultar_divida") {
        resultado = { valor_original: prop.valor_original, desconto_pct: prop.desconto_pct, valor_final: prop.valor_final, ano_divida: prop.ano_divida, valido_ate: prop.valido_ate };
      } else if (nome === "desconto_extra") {
        const { data: jaUsou } = await sb.from("negociacoes").select("id").eq("devedor_id", conv.devedor_id).eq("desconto_extra_usado", true).limit(1);
        if (jaUsou && jaUsou.length) { resultado = { ok: false, motivo: "desconto_extra_ja_usado", valor_final: prop.valor_final }; }
        else {
          const extra = Number(prop.margem_extra_pp ?? 0);
          const novoPct = Math.min(80, Number(prop.desconto_pct) + extra);
          let novoValor = Math.round(Number(prop.valor_original) * (1 - novoPct / 100) * 100) / 100;
          const faixas = carteira?.config_override?.faixas_desconto ?? cfg.faixas_desconto;
          const minPix = Number(faixas?.valor_minimo_pix ?? 30);
          if (novoValor < minPix) novoValor = Math.min(Number(prop.valor_original), minPix);
          prop.desconto_pct = novoPct; prop.valor_final = novoValor;
          resultado = { ok: true, novo_desconto_pct: novoPct, novo_valor_final: novoValor };
        }
      } else if (nome === "gerar_pix") {
        const pixResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/gerar-pix`, { method: "POST", headers: { "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify({ devedor_id: conv.devedor_id, conversa_id: conv.id, desconto_pct: prop.desconto_pct, valor_final: prop.valor_final, desconto_extra: args.desconto_extra ?? false, simulacao }) });
        const pix = await pixResp.json();
        resultado = pix.ok ? { ok: true, pix_copia_cola: pix.pix_copia_cola, valor_final: pix.valor_final, valido_ate: pix.valido_ate } : { ok: false, erro: "falha_gerar_pix" };
      } else if (nome === "escalar_humano") {
        acao = "escalar"; escalarMotivo = args.motivo ?? "nao_especificado"; encerrar = true;
        equipe = await escolherEscalador(sb, carteira, cfg, conv.devedor_id);
        await sb.from("devedores").update({ status_cobranca: "contestado" }).eq("id", conv.devedor_id).neq("status_cobranca", "pago");
        await sb.from("conversas").update({ estado: "humano" }).eq("id", conv.id);
        await sb.from("eventos_campanha").insert({ tipo: "contestacao", devedor_id: conv.devedor_id, carteira_id: carteiraId, payload: { motivo: escalarMotivo, simulacao } });
        const propTxt = prop?.valor_final ? `R$ ${prop.valor_final} (${prop.desconto_pct}% off, vale ate ${prop.valido_ate})` : "sem proposta gerada ainda";
        const resumoTxt = `Devedor: ${prop?.nome ?? ("#" + conv.devedor_id)}. Motivo da escalacao: ${escalarMotivo}. Proposta vigente: ${propTxt}. Ultima mensagem do devedor: \"${b.mensagem ?? ""}\".`;
        escalarResumo = resumoTxt;
        const { data: jaEsc } = await sb.from("escalacoes").select("id").eq("devedor_id", conv.devedor_id).in("status", ["aberta", "em_atendimento"]).limit(1);
        const novaEscalacao = !jaEsc || jaEsc.length === 0;
        if (novaEscalacao) {
          await sb.from("escalacoes").insert({ conversa_id: conv.id, devedor_id: conv.devedor_id, carteira_id: carteiraId, chip_id: conv.chip_id ?? null, motivo: escalarMotivo, contexto_snapshot: { historico: hist, mensagem: b.mensagem }, resumo: resumoTxt, equipe_chip_id: equipe?.chip_id ?? null, atendente_numero: equipe?.numero ?? null, status: "aberta" });
        }
        if (!simulacao && novaEscalacao) {
          if (equipe?.numero && conv.chip_id) {
            try {
              const { data: cred } = await sb.from("chips_credenciais").select("zapi_instance_id, zapi_token, zapi_client_token").eq("chip_id", conv.chip_id).maybeSingle();
              if (cred?.zapi_instance_id && cred?.zapi_token) {
                const fone = String(equipe.numero).replace(/\D/g, "");
                const aviso = `Novo caso para voce${equipe.nome ? ", " + equipe.nome : ""}:\n${resumoTxt}\n\nO cliente foi orientado a falar com voce e pode chamar a qualquer momento.`;
                await fetch(`https://api.z-api.io/instances/${cred.zapi_instance_id}/token/${cred.zapi_token}/send-text`, { method: "POST", headers: { "Content-Type": "application/json", "Client-Token": cred.zapi_client_token ?? "" }, body: JSON.stringify({ phone: fone, message: aviso }) });
              }
            } catch (_e) { /* nao bloqueia a escalacao */ }
          }
          try {
            const cwUrl = cfg.chatwoot?.url ?? "https://chatwoot.example.com";
            const cwAcc = cfg.chatwoot?.account_id ?? 1;
            const cwH = { "api_access_token": seg.CHATWOOT_TOKEN, "Content-Type": "application/json" };
            await fetch(`${cwUrl}/api/v1/accounts/${cwAcc}/conversations/${convId}/messages`, { method: "POST", headers: cwH, body: JSON.stringify({ content: `Escalado pelo robo. ${resumoTxt}${equipe?.numero ? " | Cobrador avisado no WhatsApp " + equipe.numero : ""}`, message_type: "outgoing", private: true }) });
            const lr = await fetch(`${cwUrl}/api/v1/accounts/${cwAcc}/conversations/${convId}/labels`, { headers: cwH });
            const ld = await lr.json().catch(() => ({}));
            const atuais = Array.isArray(ld?.payload) ? ld.payload : [];
            await fetch(`${cwUrl}/api/v1/accounts/${cwAcc}/conversations/${convId}/labels`, { method: "POST", headers: cwH, body: JSON.stringify({ labels: [...new Set([...atuais, "escalado-humano"])] }) });
            const teamNome = cfg.chatwoot?.team_escalacao ?? "Cobranca SAVAN";
            const tr = await fetch(`${cwUrl}/api/v1/accounts/${cwAcc}/teams`, { headers: cwH });
            const teams = await tr.json().catch(() => []);
            const team = Array.isArray(teams) ? teams.find((t: any) => t?.name === teamNome) : null;
            if (team?.id) await fetch(`${cwUrl}/api/v1/accounts/${cwAcc}/conversations/${convId}/assignments`, { method: "POST", headers: cwH, body: JSON.stringify({ team_id: team.id }) });
          } catch (_e) { /* nao bloqueia a escalacao */ }
        }
        resultado = equipe?.numero
          ? { ok: true, instrucao: `Encerre com naturalidade e empatia: avise que vai passar o caso para o especialista ${equipe.nome ?? "da equipe"} e que a pessoa pode falar direto com ele pelo WhatsApp ${equipe.numero}. Nao invente outros dados nem prometa prazos.` }
          : { ok: true, instrucao: "Encerre com naturalidade: avise que vai transferir para um atendente humano da equipe, que dara sequencia por aqui mesmo. Nao invente dados." };
      } else if (nome === "nao_perturbe") {
        acao = "encerrar"; encerrar = true;
        await sb.from("devedores").update({ status_cobranca: "nao_perturbe" }).eq("id", conv.devedor_id);
        await sb.from("conversas").update({ estado: "optout", proximo_followup_em: null }).eq("id", conv.id);
        await sb.from("eventos_campanha").insert({ tipo: "optout", devedor_id: conv.devedor_id, carteira_id: carteiraId, payload: { simulacao } });
        if (!simulacao) await sb.rpc("fn_inc_metrica_dia", { p_dia: new Date().toISOString().slice(0, 10), p_campo: "optouts", p_n: 1 });
      } else if (nome === "pessoa_errada") {
        acao = "encerrar"; encerrar = true;
        await sb.from("devedores").update({ status_cobranca: "recusado" }).eq("id", conv.devedor_id);
        await sb.from("conversas").update({ estado: "encerrada", proximo_followup_em: null }).eq("id", conv.id);
        await sb.from("eventos_campanha").insert({ tipo: "pessoa_errada", devedor_id: conv.devedor_id, carteira_id: carteiraId, payload: { simulacao } });
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(resultado) });
    }
  }

  const remetente = await infoRemetente(cfg, seg, convId);
  if (remetente?.lid && conv.telefone_id) {
    await sb.from("telefones_devedor").update({ chat_lid: remetente.lid }).eq("id", conv.telefone_id).is("chat_lid", null);
  }
  const enviarDireto = !!remetente?.lid;
  let creds: any = null;
  if (enviarDireto && conv.chip_id) {
    const { data } = await sb.from("chips_credenciais").select("zapi_instance_id, zapi_token, zapi_client_token").eq("chip_id", conv.chip_id).maybeSingle();
    creds = data;
  }

  for (const txt of respostas) {
    await sb.from("mensagens").insert({ conversa_id: conv.id, direcao: "saida", origem: "bot", conteudo: txt, simulacao });
    if (enviarDireto && creds?.zapi_instance_id && creds?.zapi_token) {
      try {
        await fetch(`https://api.z-api.io/instances/${creds.zapi_instance_id}/token/${creds.zapi_token}/send-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Client-Token": creds.zapi_client_token ?? "" },
          body: JSON.stringify({ phone: remetente!.lid, message: txt }),
        });
      } catch (_e) { /* nao bloqueia */ }
      try {
        const cwUrl = cfg.chatwoot?.url; const cwAcc = cfg.chatwoot?.account_id ?? 1;
        await fetch(`${cwUrl}/api/v1/accounts/${cwAcc}/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "api_access_token": seg.CHATWOOT_TOKEN, "Content-Type": "application/json" },
          body: JSON.stringify({ content: `🤖 (enviado via WhatsApp/lid): ${txt}`, message_type: "outgoing", private: true }),
        });
      } catch (_e) { /* nao bloqueia */ }
    }
  }
  if (respostas.length) await sb.from("conversas").update({ ultima_msg_em: new Date().toISOString(), ultima_msg_de: "bot" }).eq("id", conv.id);
  await sb.from("devedores").update({ status_cobranca: "em_negociacao" }).eq("id", conv.devedor_id).in("status_cobranca", ["contatado"]);

  return json({ ok: true, acao, escalar: escalarMotivo, resumo: escalarResumo, equipe: acao === "escalar" ? equipe : undefined, encerrar, simulacao, enviado_direto: enviarDireto, mensagens: enviarDireto ? [] : respostas });
});
