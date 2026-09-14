// SAVAN Recupera — preferência de resposta por contato (áudio × texto)
//
// Regra tirada do node "Calcular tipo da resposta" da Secretária v3 (fazer.ai):
//
//   1. se o contato declarou preferência, ela manda;
//   2. se não declarou, **espelhe o que a pessoa mandou** — quem manda áudio recebe áudio.
//
// O ponto do Lucas Moreira: "cliente de 70 anos e cliente de 20, cada um atendido do seu jeito,
// sem você configurar nada por pessoa". Aqui tem um segundo motivo, de dinheiro: TTS cobra por
// caractere (~R$0,08 por resposta — ver `Guias Operacionais/ElevenLabs — Guia Operacional.md` §7).
// Responder tudo em áudio custa quase o mesmo que o bot de voz inteiro. Texto é o padrão.

export type TipoResposta = "texto" | "audio";

/** Chave do atributo no Chatwoot. Mesma da v3, para o painel ficar compatível. */
export const ATRIBUTO_PREFERENCIA = "preferencia_audio_texto";

/** Definição do atributo, para criar uma vez na conta (POST /custom_attribute_definitions). */
export const DEFINICAO_ATRIBUTO_PREFERENCIA = {
  attribute_display_name: "Preferência áudio/texto",
  attribute_description: "Indica se o contato prefere receber áudio ou texto.",
  attribute_key: ATRIBUTO_PREFERENCIA,
  attribute_display_type: "list",
  attribute_model: "contact_attribute",
  attribute_values: ["audio", "texto"],
};

export function normalizarPreferencia(v: unknown): TipoResposta | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "audio" || s === "áudio") return "audio";
  if (s === "texto" || s === "text") return "texto";
  return null;
}

/**
 * Decide como responder.
 *
 * `entradaFoiAudio` é o espelho: sem preferência declarada, quem mandou áudio recebe áudio.
 * `audioDisponivel` é o freio: sem ELEVEN_LABS_API_KEY configurada, ou com o canal sem suporte
 * a áudio, cai para texto em vez de falhar no meio do envio.
 */
export function decidirTipoResposta(opts: {
  atributosContato?: Record<string, unknown> | null;
  entradaFoiAudio?: boolean;
  audioDisponivel?: boolean;
}): TipoResposta {
  if (opts.audioDisponivel === false) return "texto";
  const declarada = normalizarPreferencia(opts.atributosContato?.[ATRIBUTO_PREFERENCIA]);
  if (declarada) return declarada;
  return opts.entradaFoiAudio ? "audio" : "texto";
}

/**
 * Descrição da tool para o modelo. O bot só marca a preferência quando a pessoa **pede**;
 * ele nunca deduz "ela mandou áudio, então quer áudio" — isso já é o padrão de espelho, e
 * gravar no contato uma preferência que ninguém declarou congela o comportamento errado.
 */
export const TOOL_PREFERENCIA = {
  type: "function" as const,
  function: {
    name: ATRIBUTO_PREFERENCIA,
    description:
      "Registra a preferência do contato por receber APENAS áudio ou APENAS texto. " +
      "Use somente quando a pessoa pedir explicitamente (ex.: 'me manda por escrito', " +
      "'prefiro áudio', 'estou num lugar barulhento'). Nunca deduza pelo formato da mensagem.",
    parameters: {
      type: "object",
      properties: {
        preferencia: { type: "string", enum: ["audio", "texto"] },
      },
      required: ["preferencia"],
    },
  },
};
