/**
 * Status de um chip que estava `desconectado` e voltou a conectar.
 *
 * Reconectar nunca arma o chip: quem estava abordando volta `pausado`, e retomar é decisão do
 * operador. Até 15/10/2026 o `chips-monitor` devolvia ao ar quem estava `ativo`/`aquecendo` antes
 * de cair, e isso religou a campanha sozinha: o baileys-api endereça a conexão pelo número e é
 * compartilhado com outro projeto. O chip 1 ficou caído de 09/10 a 15/10, o número foi conectado
 * pelo outro projeto, o monitor leu "conectado" e 9 abordagens saíram por um número que já não
 * era da campanha. "O número está conectado" não diz quem conectou nem para quê.
 *
 * `conectado` volta `conectado`: nunca foi armado. Sem `status_antes` não há o que devolver —
 * `null` = o chip fica como está.
 */
export function statusNaVolta(statusAntes: string | null | undefined): string | null {
  if (statusAntes === "conectado") return "conectado";
  if (statusAntes === "ativo" || statusAntes === "aquecendo" || statusAntes === "pausado") return "pausado";
  return null;
}
