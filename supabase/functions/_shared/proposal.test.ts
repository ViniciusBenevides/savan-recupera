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

// "R$ 18,90 com 60% de desconto fica R$ 18,90" saiu para pessoas reais. Quando o valor original
// ja esta no piso nao existe desconto, e anunciar um destroi a credibilidade da conversa inteira.
Deno.test("valor original no piso ou abaixo nao tem desconto a anunciar", () => {
  const detalhes = detalharPisoProposta({
    valor_original: 18.9,
    desconto_pct: 60,
    valor_final: 18.9,
  }, 30);
  assertEquals(detalhes.pisoMinimoAplicado, false);
  assertEquals(detalhes.semDescontoPossivel, true);
  assertEquals(detalhes.descontoEfetivoPct, 0);
  assertMatch(detalhes.explicacaoObrigatoria ?? "", /não há desconto a aplicar/);

  const corrigida = garantirExplicacaoPiso(
    "Temos 60% de desconto e o valor final fica em R$ 18,90.",
    detalhes,
  );
  assert(corrigida.includes("não há desconto a aplicar"));

  const semAnuncio = garantirExplicacaoPiso(
    "O valor é R$ 18,90 para encerrar a conta em definitivo.",
    detalhes,
  );
  assertEquals(semAnuncio, "O valor é R$ 18,90 para encerrar a conta em definitivo.");
});

Deno.test("valor acima do piso com desconto real nao aciona nenhuma correcao", () => {
  const detalhes = detalharPisoProposta({
    valor_original: 100, desconto_pct: 50, valor_final: 50,
  }, 30);
  assertEquals(detalhes.semDescontoPossivel, false);
  assertEquals(detalhes.pisoMinimoAplicado, false);
  assertEquals(detalhes.explicacaoObrigatoria, null);
});
