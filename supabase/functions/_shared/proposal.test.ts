import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { detalharPisoProposta, garantirExplicacaoPiso } from "./proposal.ts";

Deno.test("explica quando desconto percentual cai abaixo do piso", () => {
  const detalhes = detalharPisoProposta({
    valor_original: 60,
    desconto_pct: 60,
    valor_final: 30,
  }, 30);
  assertEquals(detalhes.valorCalculadoComDesconto, 24);
  assertEquals(detalhes.pisoMinimoAplicado, true);
  assertEquals(detalhes.descontoEfetivoPct, 50);
  assertMatch(detalhes.explicacaoObrigatoria ?? "", /60% de desconto/);
  assertMatch(detalhes.explicacaoObrigatoria ?? "", /mínimo que recebemos/);
  assertMatch(detalhes.explicacaoObrigatoria ?? "", /R\$\s*30,00/);
});

Deno.test("nao fala em piso quando o percentual determina o valor", () => {
  const detalhes = detalharPisoProposta({
    valor_original: 100,
    desconto_pct: 60,
    valor_final: 40,
  }, 30);
  assertEquals(detalhes.pisoMinimoAplicado, false);
  assertEquals(detalhes.explicacaoObrigatoria, null);
});

Deno.test("garante explicacao se o modelo omitir o minimo sem duplicar", () => {
  const detalhes = detalharPisoProposta({
    valor_original: 60,
    desconto_pct: 60,
    valor_final: 30,
  }, 30);
  const corrigida = garantirExplicacaoPiso(
    "Consigo oferecer 60% de desconto, ficando R$ 30,00 para quitar.",
    detalhes,
  );
  assert(corrigida.includes("mínimo que recebemos"));
  const pronta = garantirExplicacaoPiso(
    "O valor final é R$ 30,00 por causa do mínimo de quitação.",
    detalhes,
  );
  assertEquals(pronta, "O valor final é R$ 30,00 por causa do mínimo de quitação.");
  assert(!garantirExplicacaoPiso("Sem proposta aqui.", detalharPisoProposta({
    valor_original: 100, desconto_pct: 60, valor_final: 40,
  }, 30)).includes("mínimo"));
});
