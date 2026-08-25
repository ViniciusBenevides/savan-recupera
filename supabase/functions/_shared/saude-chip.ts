/**
 * Índice de saúde do chip, construído sobre a taxa de recibo de entrega.
 *
 * Por que isto existe: a WABA oficial foi banida (§38) e, com ela, o semáforo GREEN/YELLOW/RED que
 * a Meta dava de graça. O canal Baileys não tem substituto oficial — não há API de qualidade. O
 * sinal mais honesto que sobra é quantas mensagens efetivamente chegam.
 *
 * O §31 é a prova de que este é o sinal certo: numa conta já restrita, o WhatsApp aceita a mensagem
 * e a descarta em silêncio. "Enviado" foi sempre o aceite do provedor, nunca a entrega. Um chip que
 * para de entregar está morrendo, mesmo que nenhum erro apareça.
 */

/** Abaixo disto não se conclui nada. Travar um chip por 2 envios azarados é o erro simétrico ao §36. */
const AMOSTRA_MINIMA = 10;

/** Acima disto, entrega normal. Nem toda mensagem é entregue: gente desliga o celular. */
const LIMITE_SAUDAVEL = 0.85;

/** Abaixo disto, não é oscilação — é bloqueio. */
const LIMITE_DEGRADADO = 0.60;

export type Veredicto = "sem_dados" | "saudavel" | "degradado" | "critico";
export type AcaoSaude = "seguir" | "travar_abordagem" | "propor_failover";

/** Proporção de entregues sobre enviadas. `null` quando não houve envio — não é 0%. */
export function taxaEntrega(enviadas: number, entregues: number): number | null {
  if (!enviadas || enviadas <= 0) return null;
  return entregues / enviadas;
}

export type AvaliacaoEntrega = { veredicto: Veredicto; taxa: number | null; amostra: number };

/**
 * O chip está entregando?
 *
 * Note a ordem: a amostra mínima é checada **antes** da taxa. Um chip com 3 envios e 0 entregas
 * não é crítico, é desconhecido — e a diferença importa, porque `critico` propõe failover e
 * failover mexe na fila de gente real.
 */
export function avaliarEntrega(dados: { enviadas: number; entregues: number }): AvaliacaoEntrega {
  const { enviadas, entregues } = dados;
  const taxa = taxaEntrega(enviadas, entregues);

  if (enviadas < AMOSTRA_MINIMA) return { veredicto: "sem_dados", taxa, amostra: enviadas };
  if (taxa === null) return { veredicto: "sem_dados", taxa, amostra: enviadas };

  if (taxa >= LIMITE_SAUDAVEL) return { veredicto: "saudavel", taxa, amostra: enviadas };
  if (taxa >= LIMITE_DEGRADADO) return { veredicto: "degradado", taxa, amostra: enviadas };
  return { veredicto: "critico", taxa, amostra: enviadas };
}

/**
 * O que fazer com cada veredicto.
 *
 * `degradado` trava a **abordagem** e só ela: o chip continua respondendo quem já fala com ele.
 * Abandonar uma conversa em andamento porque o chip está fraco seria pior para a pessoa do outro
 * lado do que terminar a conversa por um número que entrega mal.
 */
export function acaoParaVeredicto(veredicto: Veredicto): AcaoSaude {
  if (veredicto === "degradado") return "travar_abordagem";
  if (veredicto === "critico") return "propor_failover";
  return "seguir";
}
