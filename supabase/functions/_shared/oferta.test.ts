import { assertEquals } from "jsr:@std/assert@1";
import { DESCONTO_MINIMO_ANUNCIAVEL_PP, descontoEfetivoPP, resolverOpcionais } from "./oferta.ts";

// O caso que motivou o arquivo: o piso de R$ 30 come o desconto da divida pequena. A faixa diz
// 60%, o Pix cobra 33% — e e o 33% que pode ser dito, se puder ser dito algo.
Deno.test("desconto efetivo vem do valor final, nao da faixa", () => {
  assertEquals(descontoEfetivoPP(45, 30), 33);
  assertEquals(descontoEfetivoPP(1000, 400), 60);
});

Deno.test("desconto efetivo arredonda para baixo", () => {
  // 1 - 333/1000 = 66,7% -> anuncia 66, nunca 67.
  assertEquals(descontoEfetivoPP(1000, 333), 66);
});

// `1 - 90/100` da 0,09999999999999998 em ponto flutuante. Sem o epsilon, um desconto de exatos
// 10% virava 9 e a oferta sumia de quem tinha direito a ela.
Deno.test("percentual redondo nao e comido pelo ponto flutuante", () => {
  assertEquals(descontoEfetivoPP(100, 90), 10);
  assertEquals(descontoEfetivoPP(1000, 700), 30);
  assertEquals(descontoEfetivoPP(70, 49), 30);
});

Deno.test("desconto abaixo do minimo nao e anunciado", () => {
  assertEquals(descontoEfetivoPP(100, 95), null);
  assertEquals(descontoEfetivoPP(100, 100 - DESCONTO_MINIMO_ANUNCIAVEL_PP), DESCONTO_MINIMO_ANUNCIAVEL_PP);
});

Deno.test("proposta inutilizavel devolve null em vez de numero errado", () => {
  assertEquals(descontoEfetivoPP(undefined, undefined), null);
  assertEquals(descontoEfetivoPP(0, 0), null);
  assertEquals(descontoEfetivoPP(100, 120), null); // piso acima do saldo
  assertEquals(descontoEfetivoPP("abc", 30), null);
});

const MOLDE = [
  "Ola, {{primeiro_nome}}.",
  "",
  "Registro: {{valor}}, vencimento em {{vencimento}}.",
  "",
  "[[Ha uma proposta de quitacao voluntaria: de {{valor}} por {{valor_quitacao}} — {{desconto_pct}} de desconto.]]",
  "",
  "Confirma que falo com a titular?",
].join("\n");

Deno.test("com oferta o trecho fica, sem os colchetes", () => {
  const saida = resolverOpcionais(MOLDE, {
    primeiro_nome: "Ana", valor: "R$ 1.000,00", vencimento: "07/03/2014",
    valor_quitacao: "R$ 400,00", desconto_pct: "60%",
  });
  assertEquals(saida.includes("[["), false);
  assertEquals(saida.includes("]]"), false);
  assertEquals(saida.includes("por {{valor_quitacao}} — {{desconto_pct}} de desconto"), true);
});

Deno.test("sem oferta o trecho some inteiro e nao sobra paragrafo vazio", () => {
  const saida = resolverOpcionais(MOLDE, {
    primeiro_nome: "Ana", valor: "R$ 45,00", vencimento: "07/03/2014",
    valor_quitacao: "", desconto_pct: "",
  });
  assertEquals(saida.includes("proposta de quitacao"), false);
  assertEquals(saida.includes("\n\n\n"), false, "parágrafo em branco a mais denuncia template");
  assertEquals(saida.includes("Registro: {{valor}}"), true);
  assertEquals(saida.includes("Confirma que falo com a titular?"), true);
});

Deno.test("uma variavel vazia derruba o trecho inteiro", () => {
  // Meia oferta ("de R$ 45,00 por  — 33% de desconto") e pior que nenhuma.
  const saida = resolverOpcionais(MOLDE, {
    primeiro_nome: "Ana", valor: "R$ 45,00", vencimento: "07/03/2014",
    valor_quitacao: "R$ 30,00", desconto_pct: "   ",
  });
  assertEquals(saida.includes("proposta de quitacao"), false);
});

Deno.test("texto sem trecho opcional passa intacto", () => {
  const simples = "Ola, {{primeiro_nome}}.\n\nConfirma?";
  assertEquals(resolverOpcionais(simples, { primeiro_nome: "Ana" }), simples);
});
