// SAVAN Recupera — bot-turno
// O cérebro do bot negociador. Recebe a mensagem do devedor (vinda do W02/Chatwoot),
// monta o prompt com as regras inegociáveis, chama a OpenAI com function calling,
// executa as tools (consultar_divida via fn_proposta, gerar_pix, escalar_humano,
// nao_perturbe, pessoa_errada, desconto_extra) e devolve a resposta a enviar.
// Entrada: { chatwoot_conversation_id, mensagem, contato_attrs? }
// Saída:   { ok, acao, mensagens: string[], escalar?, encerrar? }
import {
  admin, carregarSegredos, getConfig, getCarteira, montarSystemPrompt, json, cors,
} from "../_shared/lib.ts";

const OPENAI = "https://api.openai.com/v1/chat/completions";

// O prompt do robô agora vem do banco (persona/contexto/guardrails), configurável pelo
// painel — global em `configuracoes` e, opcionalmente, sobrescrito por carteira.
// Ver montarSystemPrompt() em _shared/lib.ts.

function tools() {
  return [
    {
      type: "function",
      function: {
        name: "consultar_divida",
        description: "Retorna os números oficiais da dívida e a proposta de quitação (valor, desconto, validade). Use SEMPRE antes de citar qualquer valor.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "gerar_pix",
        description: "Gera o Pix de quitação quando a pessoa aceitar a proposta. Retorna o copia-e-cola.",
        parameters: {
          type: "object",
          properties: {
            desconto_extra: { type: "boolean", description: "true se está aplicando o desconto extra único" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "desconto_extra",
        description: "Aplica UMA única margem extra de desconto, somente após recusa explícita da primeira proposta. Retorna o novo valor.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "escalar_humano",
        description: "Transfere para um atendente humano (contestação, advogado, hostilidade, dúvida complexa).",
        parameters: {
          type: "object",
          properties: { motivo: { type: "string" } },
          required: ["motivo"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "nao_perturbe",
        description: "Registra que a pessoa não quer mais ser contatada e encerra.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "pessoa_errada",
        description: "Registra que o número não pertence à pessoa procurada e encerra.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
  ];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();
  await carregarSegredos(sb);
  const cfg = await getConfig(sb);
  const b = await req.json();
  const convId = b.chatwoot_conversation_id;

  // conversa + devedor
  const { data: conv } = await sb.from("conversas")
    .select("id, devedor_id, carteira_id, estado, chip_id").eq("chatwoot_conversation_id", convId).maybeSingle();
  if (!conv) return json({ ok: false, erro: "conversa_desconhecida" }, 404);

  // se já está com atendente humano (escalado), o bot NÃO responde — apenas registra a
  // mensagem para o humano ter o contexto completo. Transparência: nada se perde.
  if (conv.estado === "humano") {
    await sb.from("mensagens").insert({ conversa_id: conv.id, direcao: "entrada", origem: "devedor", conteudo: b.mensagem });
    await sb.from("conversas").update({ ultima_msg_em: new Date().toISOString(), ultima_msg_de: "devedor" }).eq("id", conv.id);
    return json({ ok: true, acao: "humano", mensagens: [] });
  }

  const { data: prop } = await sb.rpc("fn_proposta", { p_devedor_id: conv.devedor_id });

  // carteira (overrides de prompt/regras); fallback p/ carteira do devedor
  let carteiraId = conv.carteira_id;
  if (!carteiraId) {
    const { data: d } = await sb.from("devedores").select("carteira_id").eq("id", conv.devedor_id).maybeSingle();
    carteiraId = d?.carteira_id ?? null;
  }
  const carteira = await getCarteira(sb, carteiraId);

  // histórico (memória) das últimas 20 mensagens DO DEVEDOR — cruza todas as conversas
  // dele, não só a atual. Assim, se o chip cair e um número novo assumir, o bot herda o
  // contexto do que já foi tratado.
  const { data: convsDev } = await sb.from("conversas").select("id").eq("devedor_id", conv.devedor_id);
  const convIds = (convsDev ?? []).map((c) => c.id);
  const { data: histRaw } = await sb.from("mensagens")
    .select("origem, direcao, conteudo")
    .in("conversa_id", convIds.length ? convIds : [conv.id])
    .order("criado_em", { ascending: false }).limit(20);
  const hist = (histRaw ?? []).reverse();

  const messages: any[] = [{ role: "system", content: montarSystemPrompt(cfg, carteira, prop) }];
  for (const m of hist ?? []) {
    messages.push({ role: m.direcao === "entrada" ? "user" : "assistant", content: m.conteudo ?? "" });
  }
  messages.push({ role: "user", content: b.mensagem ?? "" });

  // registra mensagem de entrada do devedor
  await sb.from("mensagens").insert({
    conversa_id: conv.id, direcao: "entrada", origem: "devedor", conteudo: b.mensagem,
  });
  await sb.from("conversas").update({
    estado: "bot_ativo", ultima_msg_em: new Date().toISOString(),
    ultima_msg_de: "devedor", proximo_followup_em: null,
  }).eq("id", conv.id);
  await sb.from("eventos_campanha").insert({ tipo: "resposta", devedor_id: conv.devedor_id });
  await sb.rpc("fn_inc_metrica_dia", {
    p_dia: new Date().toISOString().slice(0, 10), p_campo: "respostas", p_n: 1,
  });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ ok: false, erro: "openai_key_ausente" }, 500);
  const modelo = cfg.ia?.modelo ?? "gpt-4.1-mini";

  const respostas: string[] = [];
  let acao = "responder";
  let escalarMotivo: string | null = null;
  let encerrar = false;

  // loop de function calling (máx 5 passos)
  for (let passo = 0; passo < 5; passo++) {
    const r = await fetch(OPENAI, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelo, messages, tools: tools(), temperature: 0.7 }),
    });
    const data = await r.json();
    const msg = data?.choices?.[0]?.message;
    if (!msg) break;
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      if (msg.content) respostas.push(msg.content);
      break;
    }

    for (const tc of msg.tool_calls) {
      const nome = tc.function.name;
      let args: any = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
      let resultado: any = { ok: true };

      if (nome === "consultar_divida") {
        resultado = {
          valor_original: prop.valor_original,
          desconto_pct: prop.desconto_pct,
          valor_final: prop.valor_final,
          ano_divida: prop.ano_divida,
          valido_ate: prop.valido_ate,
        };
      } else if (nome === "desconto_extra") {
        const { data: jaUsou } = await sb.from("negociacoes")
          .select("id").eq("devedor_id", conv.devedor_id).eq("desconto_extra_usado", true).limit(1);
        if (jaUsou && jaUsou.length) {
          resultado = { ok: false, motivo: "desconto_extra_ja_usado", valor_final: prop.valor_final };
        } else {
          const extra = Number(prop.margem_extra_pp ?? 0);
          const novoPct = Math.min(80, Number(prop.desconto_pct) + extra);
          let novoValor = Math.round(Number(prop.valor_original) * (1 - novoPct / 100) * 100) / 100;
          const faixas = carteira?.config_override?.faixas_desconto ?? cfg.faixas_desconto;
          const minPix = Number(faixas?.valor_minimo_pix ?? 30);
          if (novoValor < minPix) novoValor = Math.min(Number(prop.valor_original), minPix);
          prop.desconto_pct = novoPct;
          prop.valor_final = novoValor;
          resultado = { ok: true, novo_desconto_pct: novoPct, novo_valor_final: novoValor };
        }
      } else if (nome === "gerar_pix") {
        const pixResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/gerar-pix`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            devedor_id: conv.devedor_id, conversa_id: conv.id,
            desconto_pct: prop.desconto_pct, valor_final: prop.valor_final,
            desconto_extra: args.desconto_extra ?? false,
          }),
        });
        const pix = await pixResp.json();
        resultado = pix.ok
          ? { ok: true, pix_copia_cola: pix.pix_copia_cola, valor_final: pix.valor_final, valido_ate: pix.valido_ate }
          : { ok: false, erro: "falha_gerar_pix" };
      } else if (nome === "escalar_humano") {
        acao = "escalar"; escalarMotivo = args.motivo ?? "nao_especificado"; encerrar = true;
        await sb.from("devedores").update({ status_cobranca: "contestado" })
          .eq("id", conv.devedor_id).neq("status_cobranca", "pago");
        await sb.from("conversas").update({ estado: "humano" }).eq("id", conv.id);
        await sb.from("eventos_campanha").insert({
          tipo: "contestacao", devedor_id: conv.devedor_id, payload: { motivo: escalarMotivo },
        });
        // ledger de escalação (transparência): registra quem/por quê + snapshot do contexto.
        // Evita duplicar se já houver uma escalação aberta para o devedor.
        const { data: jaEsc } = await sb.from("escalacoes").select("id")
          .eq("devedor_id", conv.devedor_id).in("status", ["aberta", "em_atendimento"]).limit(1);
        if (!jaEsc || jaEsc.length === 0) {
          await sb.from("escalacoes").insert({
            conversa_id: conv.id, devedor_id: conv.devedor_id, carteira_id: carteiraId,
            chip_id: conv.chip_id ?? null, motivo: escalarMotivo,
            contexto_snapshot: { historico: hist, mensagem: b.mensagem }, status: "aberta",
          });
        }
        resultado = { ok: true };
      } else if (nome === "nao_perturbe") {
        acao = "encerrar"; encerrar = true;
        await sb.from("devedores").update({ status_cobranca: "nao_perturbe" }).eq("id", conv.devedor_id);
        await sb.from("conversas").update({ estado: "optout", proximo_followup_em: null }).eq("id", conv.id);
        await sb.from("eventos_campanha").insert({ tipo: "optout", devedor_id: conv.devedor_id });
        await sb.rpc("fn_inc_metrica_dia", {
          p_dia: new Date().toISOString().slice(0, 10), p_campo: "optouts", p_n: 1,
        });
        resultado = { ok: true };
      } else if (nome === "pessoa_errada") {
        acao = "encerrar"; encerrar = true;
        await sb.from("devedores").update({ status_cobranca: "recusado" }).eq("id", conv.devedor_id);
        await sb.from("conversas").update({ estado: "encerrada", proximo_followup_em: null }).eq("id", conv.id);
        await sb.from("eventos_campanha").insert({ tipo: "pessoa_errada", devedor_id: conv.devedor_id });
        resultado = { ok: true };
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(resultado),
      });
    }
  }

  // grava respostas do bot
  for (const txt of respostas) {
    await sb.from("mensagens").insert({
      conversa_id: conv.id, direcao: "saida", origem: "bot", conteudo: txt,
    });
  }
  if (respostas.length) {
    await sb.from("conversas").update({
      ultima_msg_em: new Date().toISOString(), ultima_msg_de: "bot",
    }).eq("id", conv.id);
  }
  // marca em_negociacao se ainda não tem desfecho
  await sb.from("devedores").update({ status_cobranca: "em_negociacao" })
    .eq("id", conv.devedor_id).in("status_cobranca", ["contatado"]);

  return json({ ok: true, acao, escalar: escalarMotivo, encerrar, mensagens: respostas });
});
