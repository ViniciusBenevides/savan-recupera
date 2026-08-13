import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import {
  corrigirOrientacaoPagamento,
  cpfMascarado,
  ehDuvidaDeOrigem,
  respostaOrigemDeterministica,
} from "./origin.ts";

Deno.test("detecta perguntas de ano e desconhecimento da compra", () => {
  for (const frase of ["Essa fatura foi feita em que ano?", "Não lembro dessa compra na Savan", "Quanto tempo tem essa dívida?"]) {
    assert(ehDuvidaDeOrigem(frase), frase);
  }
});

Deno.test("explica ausencia de data, cpf mascarado e cessao", () => {
  assertEquals(cpfMascarado("23353253882"), "***.***.***-82");
  const resposta = respostaOrigemDeterministica({ primeiroNome: "Julia", cpf: "23353253882", processo: "34/26467", vencimento: null });
  assertMatch(resposta, /não informa a data/);
  assertMatch(resposta, /não consigo afirmar o ano/);
  assertMatch(resposta, /MC Cred adquiriu a carteira/);
  assertMatch(resposta, /processo registrado é 34\/26467/);
  assertMatch(resposta, /não é feito na loja SAVAN/);
  assert(!resposta.includes("23353253882"));
});

Deno.test("bloqueia orientacao de pagamento na loja", () => {
  assertMatch(corrigirOrientacaoPagamento("Fique à vontade para pagar na loja."), /não é feito na loja SAVAN/);
  const correta = "O pagamento não pode ser feito na loja SAVAN.";
  assertEquals(corrigirOrientacaoPagamento(correta), correta);
});
