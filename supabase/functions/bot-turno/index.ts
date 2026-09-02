// SAVAN Recupera — bot-turno (cérebro do bot negociador, OpenAI function calling)
// Prompt (persona/contexto/guardrails) vem do banco: padrão global em `configuracoes`
// e, opcionalmente, override por carteira. Configurável pelo painel.
// Modo teste: herda conversas.simulacao -> não suja métricas reais, passa flag ao gerar-pix.
// SEGURANÇA (auditoria 2026-06-26): A1 — só o service_role (n8n W02) pode chamar; anon key recusada (401).
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { ehEstadoTerminal } from "../_shared/conversation-state.ts";
import {
  classificarRespostaIdentidade,
  ehAutorespostaComercial,
  ehAvisoDeFalecimento,
  ehIndicacaoDeContatoDeTerceiro,
  ehMencaoJuridica,
  ehMensagemSemConteudo,
  ehObjecaoConfirmacaoIdentidade,
  ehPedidoDocumentoOrigem,
  ehPedidoNaoPerturbe,
  ehPerguntaOrigemContato,
  ehRecusaSimplesNegociacao,
  ehPerguntaDeIdentidade,
  normalizar,
  periodoDoDia,
  respostaAutorespostaComercial,
  respostaConfirmacaoIdentidade,
  respostaContextoSeguroIdentidade,
  respostaFalecimento,
  respostaLimiteIdentidade,
  respostaMencaoJuridica,
  respostaMensagemSemConteudo,
  respostaNaoPerturbe,
  respostaPessoaErrada,
  respostaTerceiroIndicaContato,
  saudacaoDoPeriodo,
} from "../_shared/identity.ts";
import { detalharPisoProposta, garantirExplicacaoPiso } from "../_shared/proposal.ts";
import {
  corrigirOrientacaoPagamento,
  ehDuvidaDeOrigem,
  respostaOrigemDeterministica,
} from "../_shared/origin.ts";

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
    .select("id, nome, credor, status, cobrador_id, prompt_persona, contexto_negocio, guardrails, config_override, roteiro")
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
    .select("id, devedor_id, carteira_id, estado, chip_id, simulacao, telefone_id, etapa_roteiro, fluxo_versao_id, identidade_confirmada_em, identidade_confirmada_por")
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

  // A inbox vai junto: é ela que diz se o ponteiro ainda vale. Reapontar a conversa sem atualizar
  // a inbox deixaria o painel achando que a conversa continua na caixa do número anterior (§38).
  await sb.from("conversas").update({
    chatwoot_conversation_id: convId,
    ...(inboxId ? { chatwoot_inbox_id: inboxId, chip_id: chipId ?? alvo.chip_id } : {}),
  }).eq("id", alvo.id);
  console.log(`bot-turno auto-cura: conversa ${alvo.id} vinculada ao chatwoot_conversation_id ${convId} (devedor ${alvo.devedor_id}, inbox=${inboxId ?? "n/d"}, fone_entrada=${fone || "n/d"})`);
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

// Base de conhecimento (§33): só entram entradas APROVADAS e ATIVAS, do escopo da carteira ou globais.
// O gate de aprovação é o que impede um texto novo chegar ao devedor sem revisão humana — exigência
// do contexto jurídico da §1.
async function carregarConhecimento(sb: SupabaseClient, carteiraId: number | null): Promise<string[]> {
  let q = sb.from("bot_conhecimento").select("pergunta, resposta, carteira_id")
    .eq("aprovado", true).eq("ativo", true);
  q = carteiraId ? q.or(`carteira_id.is.null,carteira_id.eq.${carteiraId}`) : q.is("carteira_id", null);
  const { data } = await q.limit(60);
  return (data ?? []).map((e) => `P: ${e.pergunta}\nR: ${e.resposta}`);
}

// Roteiro declarativo da carteira (§33). Guia a conversa por etapas, sem substituir as tools:
// o modelo continua livre para conversar, mas sabe em que etapa está, o que precisa acontecer nela e
// para onde ir. O ganho concreto é a confirmação de identidade virar ETAPA (com o resto do roteiro
// bloqueado atrás dela), em vez de uma frase de prompt que o modelo pode atropelar.
//
// Desde a §35 o mesmo fluxo carrega os blocos de MENSAGEM (disparo/follow-up/pós-pagamento), que são
// texto pronto de outras funções. Aqui eles não entram: o bot-turno só conhece etapas de conversa —
// se o disparo entrasse como etapa, o modelo receberia "mande a 1ª mensagem" no meio do diálogo.
const ehConversa = (e: any) => (e?.tipo ?? "conversa") === "conversa";

function etapaDoRoteiro(carteira: any, etapaAtual: string | null): any | null {
  const r = carteira?.roteiro;
  if (!r?.ativo || !Array.isArray(r.etapas) || r.etapas.length === 0) return null;
  const conversas = r.etapas.filter(ehConversa);
  if (conversas.length === 0) return null;
  const atual = conversas.find((e: any) => e.id === etapaAtual);
  if (atual) return atual;
  // sem etapa marcada, começa por onde o disparo aponta ("a pessoa respondeu → …")
  const disparo = r.etapas.find((e: any) => e?.tipo === "disparo");
  const entrada = (disparo?.casos ?? []).find((c: any) => c?.vai_para)?.vai_para;
  return conversas.find((e: any) => e.id === entrada) ?? conversas[0];
}

function blocoRoteiro(etapa: any, interp: (t: unknown) => string): string[] {
  if (!etapa) return [];
  const casos = (etapa.casos ?? [])
    .filter((c: any) => c?.quando && c?.vai_para)
    .map((c: any) => {
      const exemplos = Array.isArray(c.exemplos) && c.exemplos.length
        ? ` Exemplos reais: ${c.exemplos.map((exemplo: unknown) => `“${interp(String(exemplo))}”`).join(", ")}.`
        : "";
      return `  - se ${interp(c.quando)}.${exemplos} → responda e informe PROXIMA_ETAPA: ${c.vai_para}`;
    });
  return [
    "",
    `ETAPA ATUAL DA CONVERSA: "${etapa.id}" — ${interp(etapa.objetivo ?? "")}`,
    `O QUE FAZER AGORA: ${interp(etapa.instrucao ?? "")}`,
    ...(casos.length
      ? ["CAMINHOS A PARTIR DAQUI:", ...casos,
         "Ao final da sua resposta, quando um caminho se aplicar, acrescente numa última linha isolada " +
         "exatamente `PROXIMA_ETAPA: <id>`. Essa linha é removida antes de chegar à pessoa — nunca a comente."]
      : ["Esta etapa encerra o atendimento."]),
  ];
}

// A conversa acontece num horario concreto, e o modelo nao tem relogio. Sem este bloco ele
// devolvia "Bom dia" as tres da tarde (ecoando a saudacao da pessoa), prometia retorno "ainda
// hoje" fora da janela de atendimento e tratava sexta 17h59 como se houvesse expediente adiante.
function blocoAgora(cfg: any): string[] {
  const tz = cfg.janela_envio?.tz ?? "America/Sao_Paulo";
  const agora = new Date();
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz, ...o }).format(agora);
  const periodo = periodoDoDia(agora, tz);
  const diaSemana = fmt({ weekday: "long" });
  const janela = cfg.janela_envio ?? {};
  // Dia da semana NO FUSO da operação (0=domingo), não o do relógio do servidor.
  const sigla = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(agora);
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(sigla);
  const faixas = dow >= 0 ? (janela.faixas_por_dia?.[String(dow)] ?? null) : null;
  const janelaHoje = Array.isArray(faixas) && faixas.length
    ? faixas.map((f: string[]) => `${f[0]}–${f[1]}`).join(", ")
    : (janela.inicio && janela.fim ? `${janela.inicio}–${janela.fim}` : "não definida");
  return [
    "",
    `AGORA: ${diaSemana}, ${fmt({ day: "2-digit", month: "2-digit", year: "numeric" })}, ` +
      `${fmt({ hour: "2-digit", minute: "2-digit", hour12: false })} (${tz}). Período: ${periodo}.`,
    `A saudação correta neste momento é "${saudacaoDoPeriodo(periodo)}". Use a saudação do RELÓGIO, ` +
      "nunca a que a pessoa escreveu — se ela disser \"bom dia\" às 15h, responda \"Boa tarde\". " +
      "Só cumprimente se ela cumprimentou; não abra toda mensagem com saudação.",
    `A janela de atendimento de hoje é ${janelaHoje}. Nunca prometa retorno, ligação ou envio ` +
      "em horário específico, nem diga \"em instantes\" ou \"já te retorno\": você não controla isso.",
  ];
}

function blocoTom(g: any): string[] {
  if (g?.perfis_tom === false) return [];
  return [
    "",
    "CALIBRAGEM DE TOM — leia a pessoa antes de escrever. O tom errado é tão grave quanto o dado errado:",
    "- Pessoa cordial e objetiva → seja igualmente objetiva. Frases curtas, no máximo 1 emoji, sem bajulação.",
    "- Pessoa desconfiada ou que fala em golpe → nada de emoji, nada de entusiasmo. Transparência e frases " +
      "diretas. Valide a desconfiança antes de qualquer outra coisa.",
    "- Pessoa hostil ou que xinga → nunca revide, nunca se defenda, nunca peça calma. Uma frase curta, " +
      "sem emoji, e encerre.",
    "- Pessoa em situação difícil (doença, luto, desemprego, internação) → acolhimento genuíno em uma frase, " +
      "zero linguagem comercial, nunca insista em pagamento. Saúde e luto vêm antes da cobrança, sempre.",
    "- Pessoa idosa ou com escrita/áudio de transcrição confusa → frases muito curtas, uma ideia por mensagem, " +
      "sem jargão (\"copia e cola\", \"faixa de desconto\", \"cessão de carteira\" precisam ser explicados). " +
      "Nunca soe condescendente e nunca corrija a escrita dela.",
    "- Pessoa que escreve em áudio transcrito → responda por escrito, curto, e não comente a transcrição.",
    "- Pessoa entusiasmada ou religiosa que puxa assunto → acompanhe em uma frase, no registro dela, e volte " +
      "ao ponto. Não force intimidade que ela não ofereceu.",
    "",
    "REGRAS DE ESTILO QUE VALEM SEMPRE:",
    "- NUNCA repita uma mensagem sua palavra por palavra. Se precisar dizer a mesma coisa de novo, reescreva. " +
      "Repetir literalmente é o tique que mais denuncia robô e o que mais gerou acusação de golpe.",
    "- Uma pergunta por mensagem. No máximo duas em casos excepcionais.",
    "- Nunca escreva nomes em CAIXA ALTA. Use capitalização normal.",
    "- Nunca use \"dele(a)\", \"o(a)\" ou qualquer duplicação de gênero: use o nome da pessoa ou reescreva a frase.",
    "- Não abra mensagem com \"Entendo.\" seguido de algo que não responde ao que foi dito.",
  ];
}

function montarSystemPrompt(
  cfg: any,
  carteira: any,
  prop: any,
  conhecimento: string[] = [],
  etapa: any = null,
  identidadeConfirmada = false,
): string {
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
  regras.push("Ao apresentar uma proposta com piso_minimo_aplicado=true, explique obrigatoriamente que a faixa prevê o percentual informado, mas o cálculo cairia abaixo do valor mínimo de quitação; por isso o valor final fica no mínimo indicado. Nunca diga que o valor final é o resultado direto daquele percentual.");
  if (g.responder_prescricao_honestamente !== false) regras.push("Se perguntarem sobre prescrição ou se ainda precisa pagar: responda com honestidade que, por ser dívida antiga, pode estar prescrita e o pagamento é voluntário; a proposta é um encerramento definitivo com termo de quitação. Nunca pressione.");
  if (g.confirmar_identidade !== false) regras.push(identidadeConfirmada
    ? "A IDENTIDADE JÁ FOI CONFIRMADA nesta conversa. NUNCA volte a pedir nome ou confirmação de identidade."
    : `CONFIRME A IDENTIDADE antes de revelar qualquer dado. Pergunte se fala com ${primeiroNome}. Se não for a pessoa / número errado: peça desculpas, chame a tool pessoa_errada e encerre. NUNCA revele CPF, valor da dívida ou outros dados antes da confirmação.`);
  regras.push("Se pedir para não ser mais contatada: chame a tool nao_perturbe, confirme educadamente e encerre.");
  regras.push("Se pedir comprovante, contrato ou documento da compra: não ofereça Pix novamente e não tente convencer. Chame escalar_humano para a equipe localizar a documentação; deixe claro que a pessoa pode conferir antes de decidir sobre pagamento.");
  regras.push("Se perguntar como a empresa obteve o telefone ou os dados de contato: NUNCA presuma nem afirme que o número veio da SAVAN ou de uma base cedida. Chame escalar_humano para a equipe verificar a fonte específica do dado.");
  regras.push("Uma recusa simples da proposta, como 'não', encerra a negociação com respeito. Não faça nova oferta, não pressione e não pergunte se a pessoa quer optar por não receber mensagens; só registre não perturbe quando ela pedir isso.");
  regras.push("Se disser que não lembra, não reconhece, acha que é golpe ou perguntar a origem/ano: NÃO escale ainda. Chame consultar_origem, explique os dados disponíveis, ofereça comprovação documental e o canal oficial. Se a data estiver ausente, diga isso claramente; nunca invente.");
  regras.push("Só chame escalar_humano se a pessoa pedir um atendente, fizer contestação formal depois da explicação, solicitar um documento indisponível, ou citar advogado/Procon/Justiça.");
  regras.push("A carteira de recebíveis da SAVAN foi cedida à MC Cred, atual detentora. NUNCA diga que o pagamento pode ser feito na loja SAVAN. Ofereça o Pix da MC Cred ou atendimento presencial em: Ed Central Sector, Condomínio Edifício Parthenon Center - R. 4, 515 - sala 1619 - Setor Central, Goiânia - GO, 74020-045. O endereço também consta na bio do WhatsApp.");
  const maxRodadas = Number(g.max_rodadas_desconto ?? 1);
  regras.push(`Desconto extra: no máximo ${maxRodadas} vez(es), e somente após recusa explícita da primeira proposta. Use a tool desconto_extra. Nunca ofereça abaixo do valor mínimo.`);
  if (g.regras_extras) regras.push(String(g.regras_extras));
  const tom = g.tom || "humano, caloroso, brasileiro, frases curtas, no máximo 2 perguntas por vez e 1 emoji por mensagem";
  // O conhecimento vem DEPOIS das regras: é insumo de conteúdo, nunca licença para furá-las.
  const conhecimentoNestaEtapa = etapa?.usa_conhecimento === false ? [] : conhecimento;
  const blocoConhecimento = conhecimentoNestaEtapa.length
    ? ["", "CONHECIMENTO DO NEGÓCIO (respostas já aprovadas — use quando a dúvida for essa; se não cobrir, " +
       "responda pelas regras acima e nunca invente):", ...conhecimentoNestaEtapa.map((c) => `- ${interp(c)}`)]
    : [];

  // Com roteiro ativo, a etapa substitui o "fluxo ideal" genérico: vira instrução do momento, não
  // uma sequência que o modelo tenta lembrar sozinho.
  const blocoEtapa = blocoRoteiro(etapa, interp);
  const fluxo = blocoEtapa.length
    ? blocoEtapa
    : ["", "FLUXO IDEAL: confirmar identidade -> contextualizar -> consultar_divida -> apresentar proposta (valor, desconto, validade) -> tratar objeções -> gerar_pix -> orientar pagamento -> avisar que após o pagamento envia o termo de quitação."];

  return [
    interp(persona), interp(contexto),
    ...blocoAgora(cfg), "",
    "REGRAS INEGOCIÁVEIS (violar qualquer uma é falha grave):",
    ...regras.map((r, i) => `${i + 1}. ${interp(r)}`),
    ...blocoConhecimento,
    ...fluxo,
    ...blocoTom(g), "",
    `ESTILO: ${interp(tom)}. Não soe robótica.`,
  ].join("\n");
}

function tools() {
  return [
    { type: "function", function: { name: "consultar_divida", description: "Retorna os números oficiais da dívida e a proposta. Use SEMPRE antes de citar qualquer valor.", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "consultar_origem", description: "Retorna dados verificáveis para explicar uma dívida que a pessoa não lembra ou suspeita ser golpe. Use somente depois da identidade confirmada.", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "gerar_pix", description: "Gera o Pix de quitação quando a pessoa aceitar. Retorna o copia-e-cola.", parameters: { type: "object", properties: { desconto_extra: { type: "boolean" } }, required: [] } } },
    { type: "function", function: { name: "desconto_extra", description: "Aplica UMA única margem extra de desconto, após recusa explícita da primeira proposta.", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "escalar_humano", description: "Transfere para atendente humano (contestação, advogado, hostilidade).", parameters: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] } } },
    { type: "function", function: { name: "nao_perturbe", description: "Registra que a pessoa não quer mais ser contatada e encerra.", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "pessoa_errada", description: "Registra que o número não pertence à pessoa procurada e encerra.", parameters: { type: "object", properties: {}, required: [] } } },
  ];
}

async function concluirNaoPerturbe(
  sb: SupabaseClient,
  conv: { id: number; devedor_id: number; telefone_id?: number | null },
  carteiraId: number | null,
  simulacao: boolean,
  identidadeConfirmada: boolean,
) {
  const { data: alterada, error } = await sb.from("conversas")
    .update({ estado: "optout", motivo_encerramento: "nao_perturbe", proximo_followup_em: null })
    .eq("id", conv.id).neq("estado", "optout").select("id").maybeSingle();
  if (error) throw error;
  if (!alterada) return;

  // Antes da identidade, o pedido vale para este telefone, não para todos os
  // contatos eventualmente associados ao devedor procurado.
  if (conv.telefone_id) {
    const agora = new Date().toISOString();
    const { error: erroTelefone } = await sb.from("telefones_devedor")
      .update({ whatsapp_valido: false, verificado_em: agora })
      .eq("id", conv.telefone_id);
    if (erroTelefone) throw erroTelefone;

    const { error: erroFila } = await sb.from("fila_envios")
      .update({ status: "cancelado", erro: "nao_perturbe" })
      .eq("telefone_id", conv.telefone_id)
      .in("status", ["aguardando", "processando"]);
    if (erroFila) throw erroFila;
  }
  if (identidadeConfirmada) {
    await sb.from("devedores").update({ status_cobranca: "nao_perturbe" }).eq("id", conv.devedor_id);
  }
  await sb.from("eventos_campanha").insert({
    tipo: "optout", devedor_id: conv.devedor_id, carteira_id: carteiraId,
    payload: { simulacao, escopo: identidadeConfirmada ? "devedor" : "telefone" },
  });
  if (!simulacao) {
    await sb.rpc("fn_inc_metrica_dia", {
      p_dia: new Date().toISOString().slice(0, 10), p_campo: "optouts", p_n: 1,
    });
  }
}

async function concluirPessoaErrada(
  sb: SupabaseClient,
  conv: { id: number; devedor_id: number; telefone_id?: number | null },
  carteiraId: number | null,
  simulacao: boolean,
) {
  const { data: alterada, error } = await sb.from("conversas")
    .update({ estado: "encerrada", motivo_encerramento: "pessoa_errada", proximo_followup_em: null })
    .eq("id", conv.id)
    .or("motivo_encerramento.is.null,motivo_encerramento.neq.pessoa_errada")
    .select("id").maybeSingle();
  if (error) throw error;
  if (!alterada) return;

  // Cumpra o que a mensagem de encerramento informa: este telefone nao deve
  // voltar para a fila da pessoa procurada. A conversa permanece no historico,
  // mas novas abordagens destinadas ao devedor ficam bloqueadas neste numero.
  if (conv.telefone_id) {
    const agora = new Date().toISOString();
    const { error: erroTelefone } = await sb.from("telefones_devedor")
      .update({ whatsapp_valido: false, verificado_em: agora })
      .eq("id", conv.telefone_id);
    if (erroTelefone) throw erroTelefone;

    const { error: erroFila } = await sb.from("fila_envios")
      .update({ status: "cancelado", erro: "pessoa_errada" })
      .eq("telefone_id", conv.telefone_id)
      .in("status", ["aguardando", "processando"]);
    if (erroFila) throw erroFila;
  }

  await sb.from("devedores").update({ status_cobranca: "recusado" }).eq("id", conv.devedor_id);
  await sb.from("eventos_campanha").insert({
    tipo: "pessoa_errada", devedor_id: conv.devedor_id, carteira_id: carteiraId, payload: { simulacao },
  });
}

async function concluirEscalacao(
  sb: SupabaseClient,
  p: {
    conv: any;
    carteira: any;
    cfg: any;
    seg: Record<string, string>;
    carteiraId: number | null;
    simulacao: boolean;
    chatwootConversationId: number;
    historico: any[];
    mensagem: string;
    motivo: string;
    proposta: any;
  },
) {
  const equipe = await escolherEscalador(sb, p.carteira, p.cfg, p.conv.devedor_id);
  await sb.from("devedores").update({ status_cobranca: "contestado" })
    .eq("id", p.conv.devedor_id).neq("status_cobranca", "pago");
  await sb.from("conversas").update({ estado: "humano", proximo_followup_em: null })
    .eq("id", p.conv.id);
  await sb.from("eventos_campanha").insert({
    tipo: "contestacao", devedor_id: p.conv.devedor_id, carteira_id: p.carteiraId,
    payload: { motivo: p.motivo, simulacao: p.simulacao },
  });

  const propostaTexto = p.proposta?.valor_final
    ? `R$ ${p.proposta.valor_final} (${p.proposta.desconto_pct}% off, vale ate ${p.proposta.valido_ate})`
    : "sem proposta gerada ainda";
  const resumo = `Devedor: ${p.proposta?.nome ?? ("#" + p.conv.devedor_id)}. Motivo da escalacao: ${p.motivo}. Proposta vigente: ${propostaTexto}. Ultima mensagem do devedor: "${p.mensagem}".`;
  const { data: existentes } = await sb.from("escalacoes").select("id")
    .eq("devedor_id", p.conv.devedor_id).in("status", ["aberta", "em_atendimento"]).limit(1);
  const novaEscalacao = !existentes?.length;
  if (novaEscalacao) {
    await sb.from("escalacoes").insert({
      conversa_id: p.conv.id, devedor_id: p.conv.devedor_id, carteira_id: p.carteiraId,
      chip_id: p.conv.chip_id ?? null, motivo: p.motivo,
      contexto_snapshot: { historico: p.historico, mensagem: p.mensagem }, resumo,
      equipe_chip_id: equipe?.chip_id ?? null, atendente_numero: equipe?.numero ?? null,
      status: "aberta",
    });
  }

  if (!p.simulacao && novaEscalacao) {
    try {
      const cwUrl = p.cfg.chatwoot?.url ?? "https://chatwoot.example.com";
      const cwAcc = p.cfg.chatwoot?.account_id ?? 1;
      const cwH = { "api_access_token": p.seg.CHATWOOT_TOKEN, "Content-Type": "application/json" };
      await fetch(`${cwUrl}/api/v1/accounts/${cwAcc}/conversations/${p.chatwootConversationId}/messages`, {
        method: "POST", headers: cwH,
        body: JSON.stringify({
          content: `Escalado pelo robo. ${resumo}${equipe?.numero ? " | Cobrador responsavel: " + equipe.numero : ""}`,
          message_type: "outgoing", private: true,
        }),
      });
      const labelsResponse = await fetch(
        `${cwUrl}/api/v1/accounts/${cwAcc}/conversations/${p.chatwootConversationId}/labels`,
        { headers: cwH },
      );
      const labelsBody = await labelsResponse.json().catch(() => ({}));
      const labelsAtuais = Array.isArray(labelsBody?.payload) ? labelsBody.payload : [];
      await fetch(`${cwUrl}/api/v1/accounts/${cwAcc}/conversations/${p.chatwootConversationId}/labels`, {
        method: "POST", headers: cwH,
        body: JSON.stringify({ labels: [...new Set([...labelsAtuais, "escalado-humano"])] }),
      });
      const teamNome = p.cfg.chatwoot?.team_escalacao ?? "Cobranca SAVAN";
      const teamsResponse = await fetch(`${cwUrl}/api/v1/accounts/${cwAcc}/teams`, { headers: cwH });
      const teams = await teamsResponse.json().catch(() => []);
      const team = Array.isArray(teams) ? teams.find((t: any) => t?.name === teamNome) : null;
      if (team?.id) {
        await fetch(`${cwUrl}/api/v1/accounts/${cwAcc}/conversations/${p.chatwootConversationId}/assignments`, {
          method: "POST", headers: cwH, body: JSON.stringify({ team_id: team.id }),
        });
      }
    } catch (_e) { /* a integracao nao bloqueia o registro interno da escalacao */ }
  }

  return { equipe, resumo };
}

type EstadoFila = "pendente" | "processando" | "concluida" | "suplantada" | "falhou";

async function registrarNaFila(
  sb: SupabaseClient,
  convId: number,
  messageId: number,
  conteudo: string,
): Promise<EstadoFila> {
  const { data: criada, error } = await sb.from("bot_fila_mensagens").insert({
    chatwoot_conversation_id: convId,
    chatwoot_message_id: messageId,
    conteudo,
    tipo: "pendente",
  }).select("tipo").maybeSingle();
  if (error && error.code !== "23505") throw error;
  if (criada?.tipo) return criada.tipo as EstadoFila;

  const { data: existente, error: erroExistente } = await sb.from("bot_fila_mensagens")
    .select("tipo").eq("chatwoot_message_id", messageId).maybeSingle();
  if (erroExistente) throw erroExistente;
  return (existente?.tipo ?? "pendente") as EstadoFila;
}

async function marcarFila(sb: SupabaseClient, messageId: number | null, tipo: EstadoFila) {
  if (!messageId) return;
  const { error } = await sb.from("bot_fila_mensagens").update({ tipo })
    .eq("chatwoot_message_id", messageId);
  if (error) throw error;
}

async function ehUltimaEntrada(sb: SupabaseClient, conversaId: number, messageId: number): Promise<boolean> {
  const { data, error } = await sb.from("mensagens").select("chatwoot_message_id")
    .eq("conversa_id", conversaId).eq("direcao", "entrada")
    .not("chatwoot_message_id", "is", null)
    .order("criado_em", { ascending: false }).order("id", { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw error;
  return !data?.chatwoot_message_id || Number(data.chatwoot_message_id) === messageId;
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
  const incomingMessageId = Number(b.chatwoot_message_id ?? 0) || null;

  let { data: conv } = await sb.from("conversas")
    .select("id, devedor_id, carteira_id, estado, chip_id, simulacao, telefone_id, etapa_roteiro, fluxo_versao_id, identidade_confirmada_em, identidade_confirmada_por")
    .eq("chatwoot_conversation_id", convId).maybeSingle();
  if (!conv) {
    conv = await resolverConversaPorEntrada(sb, cfg, seg, convId);
    if (!conv) return json({ ok: false, erro: "conversa_desconhecida" }, 404);
  }
  const simulacao = conv.simulacao === true;

  // Uma mensagem nova nao pode ressuscitar uma conversa que ja teve desfecho.
  // O chatwoot-sync, executado antes desta funcao, ja espelhou a entrada.
  if (ehEstadoTerminal(conv.estado)) {
    return json({ ok: true, acao: "encerrada", ignorado: "conversa_finalizada", mensagens: [] });
  }

  if (conv.estado === "humano") {
    await sb.from("mensagens").upsert({
      conversa_id: conv.id, direcao: "entrada", origem: "devedor", conteudo: b.mensagem,
      chatwoot_message_id: incomingMessageId, simulacao,
    }, incomingMessageId ? { onConflict: "chatwoot_message_id" } : undefined);
    await sb.from("conversas").update({ ultima_msg_em: new Date().toISOString(), ultima_msg_de: "devedor" }).eq("id", conv.id);
    return json({ ok: true, acao: "humano", mensagens: [] });
  }

  if (incomingMessageId) {
    const estadoFila = await registrarNaFila(sb, convId, incomingMessageId, String(b.mensagem ?? ""));
    if (estadoFila === "concluida" || estadoFila === "suplantada") {
      return json({ ok: true, ignorado: estadoFila, mensagens: [] });
    }
    if (!(await ehUltimaEntrada(sb, conv.id, incomingMessageId))) {
      await marcarFila(sb, incomingMessageId, "suplantada");
      return json({ ok: true, ignorado: "mensagem_suplantada", mensagens: [] });
    }
  }

  const { data: lockAdquirido, error: erroLock } = await sb.rpc("fn_bot_tentar_lock", {
    p_chatwoot_conversation_id: convId,
    p_expira_segundos: 120,
  });
  if (erroLock) throw erroLock;
  if (lockAdquirido !== true) {
    return json({ ok: true, adiado: "conversa_ocupada", repetir_em_segundos: 5, mensagens: [] });
  }

  try {
    // Uma mensagem pode chegar entre a primeira verificacao e a aquisicao do lock.
    if (incomingMessageId && !(await ehUltimaEntrada(sb, conv.id, incomingMessageId))) {
      await marcarFila(sb, incomingMessageId, "suplantada");
      return json({ ok: true, ignorado: "mensagem_suplantada", mensagens: [] });
    }

    // Outra execucao pode ter encerrado a conversa enquanto esta aguardava o lock.
    // Releia somente o estado e nunca deixe o update para bot_ativo abaixo desfazer
    // pessoa_errada, opt-out ou pagamento confirmado.
    const { data: estadoAtual, error: erroEstadoAtual } = await sb.from("conversas")
      .select("estado").eq("id", conv.id).maybeSingle();
    if (erroEstadoAtual) throw erroEstadoAtual;
    if (ehEstadoTerminal(estadoAtual?.estado)) {
      await marcarFila(sb, incomingMessageId, "concluida");
      return json({ ok: true, acao: "encerrada", ignorado: "conversa_finalizada", mensagens: [] });
    }
    await marcarFila(sb, incomingMessageId, "processando");

  const { data: prop } = await sb.rpc("fn_proposta", { p_devedor_id: conv.devedor_id });

  let carteiraId = conv.carteira_id;
  if (!carteiraId) {
    const { data: d } = await sb.from("devedores").select("carteira_id").eq("id", conv.devedor_id).maybeSingle();
    carteiraId = d?.carteira_id ?? null;
  }
  let carteira = await getCarteira(sb, carteiraId);
  if (conv.fluxo_versao_id) {
    const { data: versaoFluxo } = await sb.from("fluxo_versoes")
      .select("roteiro").eq("id", conv.fluxo_versao_id).maybeSingle();
    if (versaoFluxo?.roteiro && carteira) carteira = { ...carteira, roteiro: versaoFluxo.roteiro };
  }
  const cobradorId = carteira?.cobrador_id ?? null;
  cfg = await getConfig(sb, cobradorId);
  seg = await carregarSegredos(sb, cobradorId);
  const faixasProposta = carteira?.config_override?.faixas_desconto ?? cfg.faixas_desconto;
  const valorMinimoProposta = Number(faixasProposta?.valor_minimo_pix ?? 30);
  let detalhesPiso = detalharPisoProposta(prop, valorMinimoProposta);
  let equipe: { chip_id: number | null; nome: string | null; numero: string | null } | null = null;

  const { data: convsDev } = await sb.from("conversas").select("id").eq("devedor_id", conv.devedor_id);
  const convIds = (convsDev ?? []).map((c) => c.id);
  const { data: histRaw } = await sb.from("mensagens").select("origem, direcao, conteudo, chatwoot_message_id").in("conversa_id", convIds.length ? convIds : [conv.id]).order("criado_em", { ascending: false }).limit(21);
  const hist = (histRaw ?? []).filter((m: any) => !incomingMessageId || Number(m.chatwoot_message_id) !== incomingMessageId).slice(0, 20).reverse();
  const conhecimento = await carregarConhecimento(sb, carteiraId ?? null);
  let etapaAtual = etapaDoRoteiro(carteira, conv.etapa_roteiro ?? null);

  await sb.from("mensagens").upsert({
    conversa_id: conv.id, direcao: "entrada", origem: "devedor", conteudo: b.mensagem,
    chatwoot_message_id: incomingMessageId, simulacao,
  }, incomingMessageId ? { onConflict: "chatwoot_message_id" } : undefined);
  await sb.from("conversas").update({
    estado: conv.estado === "pix_enviado" ? "pix_enviado" : "bot_ativo",
    ultima_msg_em: new Date().toISOString(), ultima_msg_de: "devedor", proximo_followup_em: null,
  }).eq("id", conv.id);
  await sb.from("eventos_campanha").insert({ tipo: "resposta", devedor_id: conv.devedor_id, carteira_id: carteiraId, payload: { simulacao } });
  if (!simulacao) {
    await sb.rpc("fn_inc_metrica_dia", { p_dia: new Date().toISOString().slice(0, 10), p_campo: "respostas", p_n: 1 });
    // Resposta também é creditada AO CHIP (§33): é o que permite medir taxa de resposta por chip e o
    // heatmap hora × dia. Antes só existia o total global, que não responde "esse chip está queimado?".
    if (conv.chip_id) {
      const tz = "America/Sao_Paulo";
      const diaLocal = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const horaLocal = new Date(new Date().toLocaleString("en-US", { timeZone: tz })).getHours();
      await sb.rpc("fn_inc_chip_metrica", { p_chip: conv.chip_id, p_dia: new Date().toISOString().slice(0, 10), p_novos: 0, p_msgs: 0, p_resp: 1 });
      await sb.rpc("fn_inc_chip_metrica_hora", { p_chip: conv.chip_id, p_dia: diaLocal, p_hora: horaLocal, p_msgs: 0, p_resp: 1 });
    }
  }

  // Barreira determinística: enquanto a identidade não estiver confirmada, nenhuma chamada ao
  // modelo recebe autorização para falar de origem, CPF ou valores. Isso evita que "oi" seja
  // interpretado como confirmação. Somente resposta explicita libera os dados.
  const entradaNormal = normalizar(b.mensagem);
  const nomeProcurado = prop?.nome ?? prop?.primeiro_nome ?? "a pessoa procurada";

  // A pessoa quase nunca manda UMA mensagem. Ela manda "Sim" e, dois segundos depois, "o que
  // vocês querem?". O debounce entrega só a última à IA — e uma conversa real foi encerrada por
  // "identidade não confirmada" logo depois de a pessoa ter escrito "Sim". Toda a rajada desde a
  // última fala do bot precisa ser considerada em conjunto nas decisões determinísticas.
  const rajada: string[] = [];
  for (let i = hist.length - 1; i >= 0 && hist[i].direcao === "entrada"; i--) {
    rajada.unshift(String(hist[i].conteudo ?? ""));
  }
  rajada.push(String(b.mensagem ?? ""));
  const algumaDaRajada = (fn: (t: string) => boolean) => rajada.some(fn);

  const perguntasJaFeitas = hist
    .filter((m: any) => m.direcao === "saida" && ehPerguntaDeIdentidade(m.conteudo))
    .map((m: any) => String(m.conteudo ?? ""));
  // Mensagem sem conteúdo (emoji, figurinha, teclado) não conta como tentativa gasta.
  const tentativasAnteriores = perguntasJaFeitas.length;

  const classificacoes = rajada.map((t) => classificarRespostaIdentidade(t, nomeProcurado));
  const confirmouAgora = classificacoes.includes("confirmou");
  // Negação só prevalece se ninguém na rajada tiver confirmado.
  const negouIdentidade = !confirmouAgora && classificacoes.includes("negou");
  let identidadeConfirmada = !!conv.identidade_confirmada_em
    && conv.identidade_confirmada_por !== "legado_dados_ja_revelados";

  // Encerramento determinístico reaproveitado pelas barreiras abaixo: grava a resposta, marca a
  // etapa do roteiro correspondente e devolve o turno sem passar pelo modelo.
  const encerrarComResposta = async (
    resposta: string,
    etapa: string,
    acao: "encerrar" | "escalar" | "responder",
    extra: Record<string, unknown> = {},
  ) => {
    await sb.from("mensagens").insert({
      conversa_id: conv.id, direcao: "saida", origem: "bot", conteudo: resposta, simulacao,
    });
    await sb.from("conversas").update({
      ultima_msg_em: new Date().toISOString(), ultima_msg_de: "bot", etapa_roteiro: etapa,
    }).eq("id", conv.id);
    await marcarFila(sb, incomingMessageId, "concluida");
    return json({
      ok: true, acao, encerrar: acao !== "responder", simulacao,
      enviado_direto: false, mensagens: [resposta], ...extra,
    });
  };

  // O direito de interromper o contato não depende de confirmar identidade. Esta
  // regra vem antes de todo o restante para nunca responder "você é Fulano?" a
  // quem acabou de pedir que as mensagens parem.
  if (algumaDaRajada(ehPedidoNaoPerturbe)) {
    // Quem pede para parar e, na mesma frase, fala em advogado/Procon/justiça precisa das DUAS
    // coisas: o contato para de imediato E a equipe fica sabendo. A escalação não manda nada ao
    // devedor — só abre a nota interna e o registro em `escalacoes`.
    // ORDEM IMPORTA: concluirEscalacao move a conversa para `humano` e o devedor para
    // `contestado`; o opt-out precisa vir DEPOIS para que o estado final seja `optout` e o
    // pedido de não contatar não seja sobrescrito.
    if (algumaDaRajada(ehMencaoJuridica)) {
      await concluirEscalacao(sb, {
        conv, carteira, cfg, seg, carteiraId, simulacao,
        chatwootConversationId: convId, historico: hist,
        mensagem: String(b.mensagem ?? ""),
        motivo: "mencao_juridica_com_optout", proposta: prop,
      });
    }
    await concluirNaoPerturbe(sb, conv, carteiraId, simulacao, identidadeConfirmada);
    return await encerrarComResposta(respostaNaoPerturbe(), "encerrar_nao_perturbe", "encerrar");
  }

  // Falecimento do titular. Vem logo depois do opt-out e antes de tudo mais: nenhuma mensagem
  // sobre valor, dívida ou proposta pode sair a partir daqui, e não se pergunta por inventário,
  // herdeiro nem documento.
  if (algumaDaRajada(ehAvisoDeFalecimento)) {
    await concluirPessoaErrada(sb, conv, carteiraId, simulacao);
    await sb.from("eventos_campanha").insert({
      tipo: "titular_falecido", devedor_id: conv.devedor_id,
      carteira_id: carteiraId, payload: { simulacao },
    });
    return await encerrarComResposta(respostaFalecimento(), "titular_falecido", "encerrar");
  }

  // Advogado, Procon, justiça ou acusação de cobrança indevida encerram o automático na hora.
  // Argumentar aqui — inclusive para "esclarecer" — é o pior desfecho possível.
  if (algumaDaRajada(ehMencaoJuridica)) {
    const escalacao = await concluirEscalacao(sb, {
      conv, carteira, cfg, seg, carteiraId, simulacao,
      chatwootConversationId: convId, historico: hist,
      mensagem: String(b.mensagem ?? ""), motivo: "mencao_juridica", proposta: prop,
    });
    return await encerrarComResposta(respostaMencaoJuridica(), "escalar_juridico", "escalar", {
      escalar: "mencao_juridica", resumo: escalacao.resumo, equipe: escalacao.equipe,
    });
  }

  if (!identidadeConfirmada && confirmouAgora) {
    identidadeConfirmada = true;
    const confirmadoEm = new Date().toISOString();
    // Para onde ir depois do "sim" é decisão do FLUXO, não do código: o roteiro v2 manda para
    // `abrir_assunto` (contextualizar antes de citar número), o anterior mandava direto para
    // `proposta`. Ler o caso "confirmou" da etapa evita fixar um id que muda a cada versão.
    const destinoConfirmacao = etapaAtual?.id === "identificar"
      ? ((etapaAtual.casos ?? []).find((c: any) =>
        /confirmou|e a pessoa|sim/i.test(String(c?.quando ?? "")))?.vai_para ?? "proposta")
      : conv.etapa_roteiro;
    await sb.from("conversas").update({
      identidade_confirmada_em: confirmadoEm,
      identidade_confirmada_por: "resposta_explicita",
      etapa_roteiro: destinoConfirmacao,
    }).eq("id", conv.id);
    conv.identidade_confirmada_em = confirmadoEm;
    conv.etapa_roteiro = destinoConfirmacao;
    if (destinoConfirmacao && destinoConfirmacao !== "identificar") {
      etapaAtual = etapaDoRoteiro(carteira, destinoConfirmacao) ?? etapaAtual;
    }
  }

  if (!identidadeConfirmada) {
    // Terceiro que se oferece para repassar o contato: agradecer, NÃO registrar o número
    // oferecido e encerrar. Antes esta resposta era ignorada e a conversa voltava a perguntar
    // "você é Fulano?" a quem tinha acabado de dizer que não era.
    if (algumaDaRajada(ehIndicacaoDeContatoDeTerceiro)) {
      await concluirPessoaErrada(sb, conv, carteiraId, simulacao);
      return await encerrarComResposta(
        respostaTerceiroIndicaContato(), "terceiro_indica_contato", "encerrar",
      );
    }

    if (negouIdentidade) {
      await concluirPessoaErrada(sb, conv, carteiraId, simulacao);
      return await encerrarComResposta(
        respostaPessoaErrada(Number(incomingMessageId ?? conv.id)),
        "encerrar_pessoa_errada",
        "encerrar",
      );
    }

    // Robô de outra empresa respondendo: uma tentativa neutra, sem revelar o assunto, e sem
    // tratar o menu automático como se fosse uma pessoa.
    if (algumaDaRajada(ehAutorespostaComercial)) {
      return await encerrarComResposta(
        respostaAutorespostaComercial(nomeProcurado), "autoresposta_comercial", "responder",
      );
    }

    // Emoji, figurinha ou teclado apertado sem querer não consomem uma das duas tentativas.
    if (rajada.every(ehMensagemSemConteudo)) {
      return await encerrarComResposta(
        respostaMensagemSemConteudo(nomeProcurado), "mensagem_ininteligivel", "responder",
      );
    }

    if (tentativasAnteriores >= 2) {
      // Duas perguntas sem confirmação são o limite. Depois disso, insistir só
      // aumenta a suspeita de golpe e repete exatamente a falha observada.
      await sb.from("conversas").update({
        estado: "encerrada", motivo_encerramento: "outro", proximo_followup_em: null,
      }).eq("id", conv.id);
      await sb.from("eventos_campanha").insert({
        tipo: "identidade_nao_confirmada", devedor_id: conv.devedor_id,
        carteira_id: carteiraId, payload: { simulacao, tentativas: tentativasAnteriores },
      });
      return await encerrarComResposta(
        respostaLimiteIdentidade(), "encerrar_identidade_nao_confirmada", "encerrar",
      );
    }

    const respostaIdentidade = algumaDaRajada(ehObjecaoConfirmacaoIdentidade)
      ? respostaContextoSeguroIdentidade(nomeProcurado)
      // `perguntasJaFeitas` impede que a mesma frase saia duas vezes: repetir literalmente foi
      // o que transformou desconfiança em acusação de golpe nas conversas reais.
      : respostaConfirmacaoIdentidade(
        nomeProcurado,
        tentativasAnteriores,
        b.mensagem,
        perguntasJaFeitas,
        periodoDoDia(new Date(), cfg.janela_envio?.tz ?? "America/Sao_Paulo"),
      );
    return await encerrarComResposta(
      respostaIdentidade,
      algumaDaRajada(ehObjecaoConfirmacaoIdentidade) ? "contexto_seguro" : "identificar",
      "responder",
    );
  }

  const { data: origemDev } = await sb.from("devedores")
    .select("nome, cpf_cnpj, processo, saldo, vencimento, grupo_credor, carteira_credor")
    .eq("id", conv.devedor_id).maybeSingle();

  // Solicitações que exigem comprovação da equipe não ficam a cargo do modelo.
  // Além de evitar alucinação sobre a fonte do telefone, esta barreira impede
  // que um pedido de documento seja seguido por outra oferta de Pix.
  const pediuDocumento = ehPedidoDocumentoOrigem(b.mensagem);
  const perguntouOrigemContato = ehPerguntaOrigemContato(b.mensagem);
  if (pediuDocumento || perguntouOrigemContato) {
    const motivo = pediuDocumento ? "solicitou_documento_origem" : "solicitou_origem_dado_contato";
    const escalacao = await concluirEscalacao(sb, {
      conv, carteira, cfg, seg, carteiraId, simulacao,
      chatwootConversationId: convId, historico: hist,
      mensagem: String(b.mensagem ?? ""), motivo, proposta: prop,
    });
    const resposta = pediuDocumento
      ? "Claro. Vou encaminhar para a equipe verificar a documentação de origem da compra. Você pode conferir antes de decidir sobre qualquer pagamento. O atendimento automático fica pausado e a equipe dará sequência por aqui."
      : "Entendo a preocupação. O atendimento automático não consegue confirmar com segurança a fonte específica deste número, então não vou inventar essa informação. Encaminhei à equipe responsável para verificar a origem do contato. Não é necessário enviar CPF, documento, senha ou código.";
    await sb.from("mensagens").insert({
      conversa_id: conv.id, direcao: "saida", origem: "bot", conteudo: resposta, simulacao,
    });
    await sb.from("conversas").update({
      ultima_msg_em: new Date().toISOString(), ultima_msg_de: "bot",
    }).eq("id", conv.id);
    await marcarFila(sb, incomingMessageId, "concluida");
    return json({
      ok: true, acao: "escalar", escalar: motivo, resumo: escalacao.resumo,
      equipe: escalacao.equipe, encerrar: true, simulacao,
      enviado_direto: false, mensagens: [resposta],
    });
  }

  if (ehRecusaSimplesNegociacao(b.mensagem)) {
    const resposta = "Tudo bem. Não vou insistir. Encerrei este atendimento por aqui.";
    await sb.from("conversas").update({
      estado: "encerrada", motivo_encerramento: "outro", proximo_followup_em: null,
      ultima_msg_em: new Date().toISOString(), ultima_msg_de: "bot",
    }).eq("id", conv.id);
    await sb.from("devedores").update({ status_cobranca: "recusado" })
      .eq("id", conv.devedor_id).neq("status_cobranca", "pago");
    await sb.from("mensagens").insert({
      conversa_id: conv.id, direcao: "saida", origem: "bot", conteudo: resposta, simulacao,
    });
    await sb.from("eventos_campanha").insert({
      tipo: "recusa", devedor_id: conv.devedor_id, carteira_id: carteiraId, payload: { simulacao },
    });
    await marcarFila(sb, incomingMessageId, "concluida");
    return json({
      ok: true, acao: "encerrar", encerrar: true, simulacao,
      enviado_direto: false, mensagens: [resposta],
    });
  }

  if (ehDuvidaDeOrigem(b.mensagem)) {
    const respostaOrigem = respostaOrigemDeterministica({
      primeiroNome: prop?.primeiro_nome ?? null,
      cpf: origemDev?.cpf_cnpj ?? null,
      processo: origemDev?.processo ?? null,
      vencimento: origemDev?.vencimento ?? null,
    });
    await sb.from("mensagens").insert({
      conversa_id: conv.id, direcao: "saida", origem: "bot", conteudo: respostaOrigem, simulacao,
    });
    await sb.from("conversas").update({
      ultima_msg_em: new Date().toISOString(), ultima_msg_de: "bot",
    }).eq("id", conv.id);
    await marcarFila(sb, incomingMessageId, "concluida");
    return json({ ok: true, acao: "responder", encerrar: false, simulacao, enviado_direto: false, mensagens: [respostaOrigem] });
  }
  const messages: any[] = [{
    role: "system",
    content: montarSystemPrompt(cfg, carteira, prop, conhecimento, etapaAtual, identidadeConfirmada),
  }];
  for (const m of hist) messages.push({
    role: m.direcao === "entrada" ? "user" : "assistant", content: m.conteudo ?? "",
  });
  messages.push({ role: "user", content: b.mensagem ?? "" });

  const apiKey = seg.OPENAI_API_KEY;
  if (!apiKey) {
    await marcarFila(sb, incomingMessageId, "falhou");
    return json({ ok: false, erro: "openai_key_ausente" }, 500);
  }
  const modelo = cfg.ia?.modelo ?? "gpt-4.1-mini";

  const respostas: string[] = [];
  let acao = "responder";
  let escalarMotivo: string | null = null;
  let escalarResumo: string | null = null;
  let encerrar = false;
  const toolsExecutadas = new Set<string>();
  let pixCopiaCola: string | null = null;

  for (let passo = 0; passo < 5; passo++) {
    const r = await fetch(OPENAI, { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: modelo, messages, tools: tools(), temperature: 0.7 }) });
    const data = await r.json();
    const msg = data?.choices?.[0]?.message;
    if (!msg) break;
    messages.push(msg);
    if (!msg.tool_calls || msg.tool_calls.length === 0) { if (msg.content) respostas.push(msg.content); break; }

    for (const tc of msg.tool_calls) {
      const nome = tc.function.name;
      toolsExecutadas.add(nome);
      let args: any = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /**/ }
      let resultado: any = { ok: true };
      if (nome === "consultar_divida") {
        resultado = {
          valor_original: prop.valor_original,
          desconto_pct: prop.desconto_pct,
          valor_final: prop.valor_final,
          ano_divida: prop.ano_divida ?? null,
          data_vencimento: origemDev?.vencimento ?? null,
          valido_ate: prop.valido_ate,
          valor_calculado_com_desconto: detalhesPiso.valorCalculadoComDesconto,
          valor_minimo_quitacao: detalhesPiso.valorMinimoQuitacao,
          piso_minimo_aplicado: detalhesPiso.pisoMinimoAplicado,
          sem_desconto_possivel: detalhesPiso.semDescontoPossivel,
          desconto_efetivo_pct: detalhesPiso.descontoEfetivoPct,
          explicacao_obrigatoria: detalhesPiso.explicacaoObrigatoria,
          instrucao: detalhesPiso.semDescontoPossivel
            ? "PROIBIDO usar as palavras desconto, percentual, condicao especial ou oportunidade: o valor ja esta no piso e nao ha desconto a aplicar. Apresente apenas o encerramento definitivo com termo de quitacao."
            : detalhesPiso.pisoMinimoAplicado
            ? "OBRIGATORIO explicar que a faixa previa o percentual informado, que o calculo cairia abaixo do minimo de quitacao e que por isso o valor final e o minimo. Nunca apresente o percentual da faixa como o desconto obtido."
            : null,
        };
      } else if (nome === "consultar_origem") {
        const cpfDigitos = String(origemDev?.cpf_cnpj ?? "").replace(/\D/g, "");
        resultado = {
          origem: "SAVAN Calçados",
          atual_detentora: "MC Cred",
          cpf_mascarado: cpfDigitos.length >= 2 ? `***.***.***-${cpfDigitos.slice(-2)}` : null,
          referencia: origemDev?.processo ?? null,
          data_vencimento: origemDev?.vencimento ?? null,
          ano_divida: origemDev?.vencimento
            ? new Date(`${origemDev.vencimento}T00:00:00`).getUTCFullYear()
            : null,
          valor_registrado: origemDev?.saldo ?? prop.valor_original,
          aviso_data_ausente: origemDev?.vencimento
            ? null
            : "O cadastro disponível neste atendimento não informa a data da compra ou vencimento. Não conclua que a documentação de origem não contém essa informação; ofereça consultá-la.",
          pagamento: "Somente à MC Cred, por Pix ou no escritório informado; não orientar pagamento na loja SAVAN.",
        };
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
          detalhesPiso = detalharPisoProposta(prop, minPix);
          resultado = {
            ok: true,
            novo_desconto_pct: novoPct,
            novo_valor_final: novoValor,
            valor_calculado_com_desconto: detalhesPiso.valorCalculadoComDesconto,
            valor_minimo_quitacao: detalhesPiso.valorMinimoQuitacao,
            piso_minimo_aplicado: detalhesPiso.pisoMinimoAplicado,
            desconto_efetivo_pct: detalhesPiso.descontoEfetivoPct,
            explicacao_obrigatoria: detalhesPiso.explicacaoObrigatoria,
          };
        }
      } else if (nome === "gerar_pix") {
        const pixResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/gerar-pix`, { method: "POST", headers: { "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", "Content-Type": "application/json" }, body: JSON.stringify({ devedor_id: conv.devedor_id, conversa_id: conv.id, desconto_pct: prop.desconto_pct, valor_final: prop.valor_final, desconto_extra: args.desconto_extra ?? false, simulacao }) });
        const pix = await pixResp.json();
        if (!pixResp.ok || !pix.ok) console.error("gerar_pix_falhou", { status: pixResp.status, erro: pix.erro, detalhe: pix.detalhe });
        pixCopiaCola = pix.ok && typeof pix.pix_copia_cola === "string" ? pix.pix_copia_cola.trim() : null;
        resultado = pix.ok && pixCopiaCola
          ? { ok: true, valor_final: pix.valor_final, valido_ate: pix.valido_ate, instrucao: "Confirme o Pix e oriente o pagamento sem reproduzir o codigo; o copia-e-cola sera enviado automaticamente em uma mensagem separada." }
          : { ok: false, erro: "falha_gerar_pix" };
      } else if (nome === "escalar_humano") {
        const motivoNormal = normalizar(args.motivo);
        const apenasDuvidaOrigem = /nao (lembra|reconhece)|golpe|origem|ano da divida/.test(motivoNormal);
        const entradaDuvidaOrigem = /nao (lembro|lembra|reconheco|reconhece)|golpe|que ano|em que ano|compra na savan/.test(entradaNormal);
        const pediuEscalacaoReal = /atendente|humano|advogad|procon|justica|documento|comprovante|contestacao formal/.test(entradaNormal);
        if ((apenasDuvidaOrigem || entradaDuvidaOrigem) && !pediuEscalacaoReal) {
          toolsExecutadas.delete("escalar_humano");
          resultado = {
            ok: false,
            motivo: "duvida_de_origem_nao_exige_humano",
            instrucao: "Nao escale. Chame consultar_origem, explique a cessao da carteira para a MC Cred e continue a conversa.",
          };
        } else {
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
          // Nao ha ping no WhatsApp do cobrador (saia pela instancia nao-oficial, e a API oficial
          // nao manda texto livre a um numero fora da janela de 24h). Nem precisa: quem passa o
          // contato e o proprio bot, na conversa aberta com o devedor — a instrucao da ferramenta
          // escalar manda dizer "fale com a empresa <nome> no WhatsApp <numero>". Aqui fica so o rastro
          // interno: nota privada no Chatwoot + linha em escalacoes p/ a aba "Precisam de voce".
          try {
            const cwUrl = cfg.chatwoot?.url ?? "https://chatwoot.example.com";
            const cwAcc = cfg.chatwoot?.account_id ?? 1;
            const cwH = { "api_access_token": seg.CHATWOOT_TOKEN, "Content-Type": "application/json" };
            await fetch(`${cwUrl}/api/v1/accounts/${cwAcc}/conversations/${convId}/messages`, { method: "POST", headers: cwH, body: JSON.stringify({ content: `Escalado pelo robo. ${resumoTxt}${equipe?.numero ? " | Cobrador responsavel: " + equipe.numero : ""}`, message_type: "outgoing", private: true }) });
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
          ? { ok: true, instrucao: `Encerre com naturalidade e empatia: avise que vai passar o caso para a empresa ${equipe.nome ?? "responsavel pelo atendimento"} e que a pessoa pode falar diretamente com a equipe pelo WhatsApp ${equipe.numero}. Nao invente outros dados nem prometa prazos.` }
          : { ok: true, instrucao: "Encerre com naturalidade: avise que vai transferir para um atendente humano da equipe, que dara sequencia por aqui mesmo. Nao invente dados." };
        }
      } else if (nome === "nao_perturbe") {
        acao = "encerrar"; encerrar = true;
        await concluirNaoPerturbe(sb, conv, carteiraId, simulacao, true);
      } else if (nome === "pessoa_errada") {
        acao = "encerrar"; encerrar = true;
        await concluirPessoaErrada(sb, conv, carteiraId, simulacao);
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(resultado) });
    }
  }

  const remetente = await infoRemetente(cfg, seg, convId);
  if (remetente?.lid && conv.telefone_id) {
    await sb.from("telefones_devedor").update({ chat_lid: remetente.lid }).eq("id", conv.telefone_id).is("chat_lid", null);
  }
  // O @lid era do protocolo do WhatsApp Web (privacidade). A Cloud API endereca por telefone e nao
  // tem @lid — guardamos o identificador se o Chatwoot mandar um, mas toda resposta do bot sai pelo
  // caminho normal Chatwoot -> canal oficial (texto livre vale dentro da janela de 24h).

  // Avanço do roteiro (§33): o modelo marca o caminho com uma última linha `PROXIMA_ETAPA: <id>`.
  // A linha é removida antes de qualquer envio — a pessoa nunca vê a mecânica — e o id só é aceito se
  // existir mesmo no roteiro (modelo inventando etapa não move a conversa).
  if (etapaAtual) {
    // só etapas de CONVERSA são destino válido: o modelo não pode mandar a conversa "voltar" para
    // um bloco de disparo ou de pós-pagamento, que nem são executados aqui (§35)
    const idsValidos = new Set(
      (carteira?.roteiro?.etapas ?? []).filter(ehConversa).map((e: any) => e.id));
    let proxima: string | null = null;
    for (let i = 0; i < respostas.length; i++) {
      respostas[i] = respostas[i].replace(/^\s*PROXIMA_ETAPA:\s*([a-z0-9_\-]+)\s*$/gim, (_m, id) => {
        if (idsValidos.has(id)) proxima = id;
        return "";
      }).trim();
    }
    for (let i = respostas.length - 1; i >= 0; i--) if (!respostas[i]) respostas.splice(i, 1);
    if (proxima && proxima !== conv.etapa_roteiro) {
      await sb.from("conversas").update({ etapa_roteiro: proxima }).eq("id", conv.id);
    } else if (!conv.etapa_roteiro) {
      await sb.from("conversas").update({ etapa_roteiro: etapaAtual.id }).eq("id", conv.id);
    }

    // Uma etapa pode classificar a resposta e apontar direto para um encerramento. Nesse caso não
    // haverá um próximo turno para a etapa terminal chamar sua tool. Executamos a ação declarada no
    // destino agora, de forma idempotente, para a conversa não ficar falsamente em "Respondeu".
    const destino = (carteira?.roteiro?.etapas ?? []).find((e: any) => ehConversa(e) && e.id === proxima);
    const instrucaoDestino = `${destino?.id ?? ""} ${destino?.instrucao ?? ""}`.toLowerCase();
    if (proxima && instrucaoDestino.includes("pessoa_errada") && !toolsExecutadas.has("pessoa_errada")) {
      acao = "encerrar"; encerrar = true;
      await concluirPessoaErrada(sb, conv, carteiraId, simulacao);
    } else if (proxima && instrucaoDestino.includes("nao_perturbe") && !toolsExecutadas.has("nao_perturbe")) {
      acao = "encerrar"; encerrar = true;
      await concluirNaoPerturbe(sb, conv, carteiraId, simulacao, true);
    }
  }

  // Segunda barreira, deterministica: se o modelo apresentar a proposta e omitir
  // a justificativa do piso, acrescente a explicacao antes de gravar/enviar.
  if ((detalhesPiso.pisoMinimoAplicado || detalhesPiso.semDescontoPossivel)
    && (toolsExecutadas.has("consultar_divida") || toolsExecutadas.has("desconto_extra"))
    && !toolsExecutadas.has("gerar_pix")
    && respostas.length) {
    const indice = respostas.length - 1;
    respostas[indice] = garantirExplicacaoPiso(respostas[indice], detalhesPiso);
  }

  for (let i = 0; i < respostas.length; i++) {
    respostas[i] = corrigirOrientacaoPagamento(respostas[i]);
  }

  // O copia-e-cola vai sozinho na ultima mensagem para permitir copiar com um toque,
  // sem saudacao, rotulo, aspas, Markdown ou qualquer outro texto ao redor.
  if (pixCopiaCola) respostas.push(pixCopiaCola);

  for (const txt of respostas) {
    await sb.from("mensagens").insert({ conversa_id: conv.id, direcao: "saida", origem: "bot", conteudo: txt, simulacao });
  }
  if (respostas.length) await sb.from("conversas").update({ ultima_msg_em: new Date().toISOString(), ultima_msg_de: "bot" }).eq("id", conv.id);
  await sb.from("devedores").update({ status_cobranca: "em_negociacao" }).eq("id", conv.devedor_id).in("status_cobranca", ["contatado"]);

  await marcarFila(sb, incomingMessageId, "concluida");
  return json({ ok: true, acao, escalar: escalarMotivo, resumo: escalarResumo, equipe: acao === "escalar" ? equipe : undefined, encerrar, simulacao, enviado_direto: false, mensagens: respostas });
  } finally {
    // Se a IA ou qualquer integracao falhar, a conversa nao fica presa. O registro da
    // fila permanece reprocessavel e o lock abandonado tambem expira no banco.
    const { error } = await sb.from("bot_locks").delete().eq("chatwoot_conversation_id", convId);
    if (error) console.error("bot-turno: falha ao liberar lock", error.message);
  }
});
