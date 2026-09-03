import { assertEquals } from "jsr:@std/assert@1";
import { motivoDaDesconexao } from "./evolution-client.ts";

// ── motivoDaDesconexao ───────────────────────────────────────────────────────────────────
//
// Por que estes testes existem: em 03/09/2026 o chip 1 apareceu como `401` e a leitura imediata
// foi "número banido". Era `conflict/device_removed` — o aparelho vinculado removido da conta,
// que volta com logout + QR novo. O código tem que preservar essa distinção, porque ela é a
// diferença entre trocar o número e reconectar o mesmo.

Deno.test("sessao revogada: devolve tag e tipo, nao so o codigo", () => {
  const bruto = JSON.stringify({
    error: {
      data: { tag: "conflict", attrs: { type: "device_removed" } },
      isBoom: true,
      output: { statusCode: 401, payload: { statusCode: 401, error: "Unauthorized", message: "Stream Errored (conflict)" } },
    },
    date: "2026-09-02T19:59:44.517Z",
  });
  assertEquals(motivoDaDesconexao(bruto), "conflict/device_removed");
});

Deno.test("sem tag estruturada, cai na mensagem do payload", () => {
  const bruto = JSON.stringify({
    error: { data: null, output: { statusCode: 401, payload: { message: "Log out instance: chip-1-14" } } },
  });
  assertEquals(motivoDaDesconexao(bruto), "Log out instance: chip-1-14");
});

Deno.test("so tag, sem attrs.type", () => {
  const bruto = JSON.stringify({ error: { data: { tag: "conflict" } } });
  assertEquals(motivoDaDesconexao(bruto), "conflict");
});

// Falha fechada: sem motivo legível o resultado é `null`, nunca uma string inventada. O painel
// prefere não dizer nada a dizer algo errado sobre por que um número caiu.
Deno.test("entrada imprestavel nunca vira motivo", () => {
  assertEquals(motivoDaDesconexao(null), null);
  assertEquals(motivoDaDesconexao(undefined), null);
  assertEquals(motivoDaDesconexao(""), null);
  assertEquals(motivoDaDesconexao("   "), null);
  assertEquals(motivoDaDesconexao("nao e json"), null);
  assertEquals(motivoDaDesconexao(42), null);
  assertEquals(motivoDaDesconexao({ error: "objeto, nao string" }), null);
  assertEquals(motivoDaDesconexao(JSON.stringify({ error: {} })), null);
});
