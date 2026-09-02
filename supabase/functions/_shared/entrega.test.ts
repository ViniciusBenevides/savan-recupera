import { assertEquals } from "jsr:@std/assert@1";
import {
  deveGravarEntrega,
  ENTREGA_ENTREGUE,
  ENTREGA_ENVIADO,
  ENTREGA_FALHOU,
  ENTREGA_LIDO,
  entregaConfirmada,
  statusEntregaDoChatwoot,
} from "./entrega.ts";

Deno.test("os quatro status do Chatwoot viram a escala do banco", () => {
  assertEquals(statusEntregaDoChatwoot("failed"), 0);
  assertEquals(statusEntregaDoChatwoot("sent"), 1);
  assertEquals(statusEntregaDoChatwoot("delivered"), 2);
  assertEquals(statusEntregaDoChatwoot("read"), 3);
});

Deno.test("maiuscula e espaco nao quebram o mapeamento", () => {
  assertEquals(statusEntregaDoChatwoot(" Failed "), 0);
  assertEquals(statusEntregaDoChatwoot("DELIVERED"), 2);
});

Deno.test("mensagem em voo fica sem recibo, e isso nao e 'enviado'", () => {
  // A diferenca importa: o indice de saude do chip mede ENTREGA sobre ENVIO, e contar uma
  // mensagem em voo como enviada inflaria o denominador sem que nada tenha sido decidido (§31).
  assertEquals(statusEntregaDoChatwoot("progress"), null);
  assertEquals(statusEntregaDoChatwoot(null), null);
  assertEquals(statusEntregaDoChatwoot(undefined), null);
  assertEquals(statusEntregaDoChatwoot(""), null);
  assertEquals(statusEntregaDoChatwoot("status_que_o_chatwoot_ainda_nao_inventou"), null);
});

Deno.test("recibo avanca, nunca retrocede: um 'sent' atrasado nao apaga um 'read'", () => {
  assertEquals(deveGravarEntrega(ENTREGA_LIDO, ENTREGA_ENVIADO), false);
  assertEquals(deveGravarEntrega(ENTREGA_ENTREGUE, ENTREGA_LIDO), true);
  assertEquals(deveGravarEntrega(null, ENTREGA_ENVIADO), true);
});

Deno.test("falha vence qualquer recibo anterior", () => {
  // O provedor recusou. Chegar depois de um 'sent' nao torna a mensagem entregue — e foi
  // exatamente esconder isso que deixou 390 abordagens morrerem invisiveis (§38).
  assertEquals(deveGravarEntrega(ENTREGA_ENVIADO, ENTREGA_FALHOU), true);
  assertEquals(deveGravarEntrega(ENTREGA_LIDO, ENTREGA_FALHOU), true);
});

Deno.test("falha nao se regrava, e nada apaga uma falha", () => {
  assertEquals(deveGravarEntrega(ENTREGA_FALHOU, ENTREGA_FALHOU), false);
  assertEquals(deveGravarEntrega(ENTREGA_FALHOU, ENTREGA_ENVIADO), false);
  assertEquals(deveGravarEntrega(ENTREGA_FALHOU, ENTREGA_ENTREGUE), true);
});

Deno.test("sem recibo novo, nada e gravado", () => {
  assertEquals(deveGravarEntrega(null, null), false);
  assertEquals(deveGravarEntrega(ENTREGA_LIDO, null), false);
});

Deno.test("so conta como entrega o que chegou ao aparelho", () => {
  assertEquals(entregaConfirmada(ENTREGA_FALHOU), false);
  // "enviado" e o aceite do provedor, nunca a entrega — a licao inteira do §31.
  assertEquals(entregaConfirmada(ENTREGA_ENVIADO), false);
  assertEquals(entregaConfirmada(ENTREGA_ENTREGUE), true);
  assertEquals(entregaConfirmada(ENTREGA_LIDO), true);
  assertEquals(entregaConfirmada(null), false);
});
