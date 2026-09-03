import { assertEquals } from "jsr:@std/assert@1";
import { classificarErroEnvioBaileysApi } from "./baileys-api-client.ts";

// A doc oficial do baileys-api (fazer-ai) é explícita sobre dois pontos que estes testes travam:
//
// - 404 = "Phone number not connected" → chip_caido de verdade.
// - 503 = circuit breaker aberto / mutex de keystore travado → a doc AVISA que a conexão está de
//   pé e NÃO deve ser marcada como caída. Errar isso aqui derruba chip saudável.
//
// 409/504 têm resultado indeterminado (mensagem pode ter saído sem confirmação) — não podem virar
// `chip_caido` nem `retentar`, porque o `campanha-registrar` só reenfileira erro CERTO de nada ter
// saído (§31: reenviar em dobro é padrão de robô).

Deno.test("404 - telefone nao conectado - e chip_caido", () => {
  assertEquals(classificarErroEnvioBaileysApi(404), "chip_caido");
});

Deno.test("503 - circuit breaker/mutex - e retentar, NUNCA chip_caido", () => {
  assertEquals(classificarErroEnvioBaileysApi(503), "retentar");
});

Deno.test("421 - misdirected em modo cluster - e retentar", () => {
  assertEquals(classificarErroEnvioBaileysApi(421), "retentar");
});

Deno.test("409 e 504 - resultado indeterminado - caem em falha, nao em retentar", () => {
  assertEquals(classificarErroEnvioBaileysApi(409), "falha");
  assertEquals(classificarErroEnvioBaileysApi(504), "falha");
});

Deno.test("403 e 500 tambem caem em falha", () => {
  assertEquals(classificarErroEnvioBaileysApi(403), "falha");
  assertEquals(classificarErroEnvioBaileysApi(500), "falha");
});

Deno.test("falha fechada: codigo desconhecido nunca vira chip_caido nem retentar", () => {
  assertEquals(classificarErroEnvioBaileysApi(418), "falha");
  assertEquals(classificarErroEnvioBaileysApi(0), "falha");
});
