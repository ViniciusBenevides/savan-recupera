/**
 * Recibo de entrega: o que o provedor respondeu sobre uma mensagem que saiu.
 *
 * Só decisão pura aqui — o I/O está no `chatwoot-sync`. Esta separação importa porque é este
 * mapeamento que decide se uma falha aparece na tela, e ele já falhou por omissão: entre 24/08 e
 * 01/09/2026, 390 abordagens foram recusadas pela inbox da WABA banida (§38) e o painel mostrou
 * todas como enviadas, porque `status_entrega` era sempre nulo.
 *
 * A escala é a de `mensagens.status_entrega` (migration 20260902120000):
 *   0 falhou · 1 enviado · 2 entregue · 3 lido · 4 reproduzido · null sem recibo
 */

export const ENTREGA_FALHOU = 0;
export const ENTREGA_ENVIADO = 1;
export const ENTREGA_ENTREGUE = 2;
export const ENTREGA_LIDO = 3;
export const ENTREGA_REPRODUZIDO = 4;

const DO_CHATWOOT: Record<string, number> = {
  failed: ENTREGA_FALHOU,
  sent: ENTREGA_ENVIADO,
  delivered: ENTREGA_ENTREGUE,
  read: ENTREGA_LIDO,
};

/**
 * Status do Chatwoot → nossa escala.
 *
 * `progress` (e qualquer coisa desconhecida) vira `null` de propósito: "ainda sem recibo" é
 * informação diferente de "enviado", e o índice de saúde do chip depende dessa diferença. O §31 é
 * a prova — numa conta restrita o WhatsApp aceita e descarta em silêncio, então tratar ausência de
 * recibo como envio bem-sucedido esconderia exatamente o sinal que se quer medir.
 */
export function statusEntregaDoChatwoot(bruto: unknown): number | null {
  const chave = String(bruto ?? "").trim().toLowerCase();
  return chave in DO_CHATWOOT ? DO_CHATWOOT[chave] : null;
}

/**
 * O recibo novo deve substituir o que já está gravado?
 *
 * Três regras, nesta ordem:
 *  1. **Falha vence tudo.** O provedor recusou; chegar depois de um `sent` não torna a mensagem
 *     entregue. Esconder isso foi o defeito original.
 *  2. **Só uma entrega CONFIRMADA tira uma falha.** Um `sent` atrasado não desfaz uma recusa — ele
 *     é o aceite do provedor, que é justamente o que não prova nada (§31). Sem esta regra, a falha
 *     voltaria a sumir sozinha, que é o bug que este módulo existe para impedir.
 *  3. **Fora isso, só avança.** Recibos chegam fora de ordem; um `sent` atrasado não pode apagar
 *     um `read` que já veio.
 */
export function deveGravarEntrega(atual: number | null, novo: number | null): boolean {
  if (novo === null) return false;
  if (novo === ENTREGA_FALHOU) return atual !== ENTREGA_FALHOU;
  if (atual === ENTREGA_FALHOU) return novo >= ENTREGA_ENTREGUE;
  if (atual === null) return true;
  return novo > atual;
}

/** A entrega foi confirmada no aparelho? É o numerador da taxa que mede a saúde do chip. */
export function entregaConfirmada(status: number | null): boolean {
  return status !== null && status >= ENTREGA_ENTREGUE;
}
