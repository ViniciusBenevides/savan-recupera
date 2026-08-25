/**
 * O opt-in: a permissão do devedor para o robô falar do assunto.
 *
 * Por que existe (ADR-0003): a conta oficial foi banida com
 * `ban_reason = bm_reactive_scam_model_enforcement_heuristic` — o modelo antifraude reagiu ao
 * PADRÃO da abordagem, não ao volume. Pessoas que não reconheciam a MC Cred (credora por cessão,
 * sem relação prévia com elas) bloqueavam e denunciavam. A primeira mensagem deixa de cobrar e
 * passa a pedir licença.
 *
 * A distinção central está em `classificarRespostaOptIn`: **pergunta sobre o assunto é interesse;
 * pergunta sobre quem fala é desconfiança.** Tratar desconfiança como consentimento foi exatamente
 * o erro que gerou as acusações de golpe nas conversas reais.
 */

import { normalizar, primeiroNomeLegivel } from "./identity.ts";

export type EstadoOptIn = "nao_perguntado" | "aguardando" | "concedido" | "recusado";

export type RespostaOptIn =
  | "concede"
  | "pergunta_assunto"
  | "pergunta_quem_fala"
  | "recusa"
  | "ambiguo";

/** Consentimento explícito. Curto e direto — não force o devedor a escrever uma frase. */
const PADROES_CONCEDE = [
  /^(sim|s|ok|okay|claro|certo|pode|manda|beleza|blz|bora|uhum|aham|isso)\b/,
  /\bpode (falar|mandar|dizer|explicar|continuar|sim)\b/,
  /\b(manda|fala|diga|explica) (ai|logo|pra mim)?\b/,
  /\bquero saber\b/,
  /\bsem problema\b/,
];

/** Quer saber DO QUE se trata. Isso é interesse: destrava. */
const PADROES_PERGUNTA_ASSUNTO = [
  /\bdo que se trata\b/,
  /\bde que se trata\b/,
  /\bqual (o |e o )?assunto\b/,
  /\bque (atendimento|conta|registro|informacao|assunto)\b/,
  /\bsobre o que\b/,
  /\bo que (e|seria|voce quer|houve)\b/,
  /\bque negocio e esse\b/,
];

/**
 * Quer saber QUEM está falando, ou suspeita de fraude. Isso é desconfiança: NÃO destrava.
 * Vai para a etapa de esclarecimento, que pode ser usada uma única vez.
 */
const PADROES_PERGUNTA_QUEM_FALA = [
  /\bquem (e|fala|esta falando|e voce|e essa|e esse)\b/,
  /\b(e|eh) golpe\b/,
  /\bgolpe\b/,
  /\b(que|qual) empresa\b/,
  /\bnao conheco (voce|essa empresa|vcs)\b/,
  /\bde onde (voce|vc|vcs)\b/,
  /\bnumero desconhecido\b/,
];

const PADROES_RECUSA = [
  /^(nao|n|nop|nunca)\b/,
  /\bnao (quero|tenho interesse|me interessa|desejo)\b/,
  /\b(para|pare|parem|pra) de (mandar|enviar|me mandar)\b/,
  /\bme (tira|tire|remove|remova|exclui|exclua)\b/,
  /\bnao me (mande|mandem|procure|procurem|perturbe|incomode)\b/,
  /\bsai(r)? dessa lista\b/,
  /\bdescadastr/,
];

/**
 * O que a pessoa respondeu ao pedido de permissão.
 *
 * A ordem de checagem importa: **recusa primeiro**, para "não quero saber do que se trata" não
 * cair em `pergunta_assunto`; depois desconfiança, para "quem é você, é golpe?" não cair em
 * `pergunta_assunto` por causa do "o que"; só então interesse; e concessão por último, porque os
 * padrões dela são os mais curtos e por isso os mais capazes de casar por acidente.
 */
export function classificarRespostaOptIn(entrada: unknown): RespostaOptIn {
  const t = normalizar(entrada);
  if (!t) return "ambiguo";

  if (PADROES_RECUSA.some((p) => p.test(t))) return "recusa";
  if (PADROES_PERGUNTA_QUEM_FALA.some((p) => p.test(t))) return "pergunta_quem_fala";
  if (PADROES_PERGUNTA_ASSUNTO.some((p) => p.test(t))) return "pergunta_assunto";
  if (PADROES_CONCEDE.some((p) => p.test(t))) return "concede";

  return "ambiguo";
}

/**
 * O gate do §1 e do ADR-0003: sem "concedido", nenhum dado da conta sai.
 *
 * Isto não é conselho para o modelo — é a condição que o `bot-turno` consulta antes de montar o
 * prompt. Uma regra que o LLM pode atropelar não é uma regra.
 */
export function podeRevelarDados(estado: EstadoOptIn): boolean {
  return estado === "concedido";
}

/**
 * Transição do opt-in.
 *
 * Duas regras que não são simétricas, de propósito:
 *
 * - **`recusado` é terminal.** Nem um "sim" posterior reabre. Se a pessoa mudar de ideia, ela
 *   procura a empresa pelo canal oficial — o caminho de volta não passa por automação.
 * - **`concedido` não regride** por mensagem ambígua ou por uma pergunta de "quem é você" no meio
 *   da conversa (que aí é dúvida legítima, não a desconfiança da porta de entrada). Mas ainda
 *   aceita uma recusa: o direito de parar vale a qualquer momento.
 */
export function proximoEstadoOptIn(atual: EstadoOptIn, resposta: RespostaOptIn): EstadoOptIn {
  if (atual === "recusado") return "recusado";
  if (resposta === "recusa") return "recusado";
  if (atual === "concedido") return "concedido";

  if (resposta === "concede" || resposta === "pergunta_assunto") return "concedido";
  return atual === "nao_perguntado" ? "nao_perguntado" : "aguardando";
}

/**
 * A mensagem de abertura (decisão do Q13).
 *
 * Três coisas que ela faz e uma que ela não faz:
 * - usa o **primeiro nome**, que soa pessoa e não robô, sem expor o nome completo a um número que
 *   pode estar reciclado (a base tem telefones de 15 anos);
 * - diz quem está falando, porque a surpresa é o que gera denúncia;
 * - **declara a saída fácil**, que é o que converte "isso é golpe!" em silêncio educado;
 * - **não pergunta identidade.** Confirmar quem é vem depois do sim, como etapa separada. Juntar
 *   as duas coisas na primeira mensagem foi o que criou o loop de identidade nas conversas reais.
 */
export function mensagemOptIn(nome: unknown, empresa: string): string {
  const primeiro = primeiroNomeLegivel(nome);
  return `Oi, ${primeiro}! Aqui é da ${empresa}. ` +
    `Tenho uma informação sobre um atendimento antigo em seu nome — posso te explicar em duas linhas? ` +
    `Se não fizer sentido, é só ignorar que eu não escrevo de novo.`;
}
