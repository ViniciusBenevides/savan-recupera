import { assert, assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import {
  classificarRespostaIdentidade,
  ehPerguntaDeIdentidade,
  nomeCompletoLegivel,
  primeiroNomeLegivel,
  respostaConfirmacaoIdentidade,
  respostaPessoaErrada,
} from "./identity.ts";

Deno.test("reconhece negacoes com texto adicional e outro nome", () => {
  const negativas = [
    "Nao sou eu\nEu me chamo Roberto",
    "Não sou ela, sou a irmã",
    "Não é Leandro",
    "Não é comigo",
    "Meu nome é Roberto",
    "Aqui é o Carlos",
    "Você está falando com Roberto",
    "Roberto falando",
    "Ele não mora aqui",
    "Ele é meu marido",
    "Esse número não pertence a ele",
    "Não conheço essa pessoa",
    "Vocês mandaram errado",
    "Número reciclado",
  ];
  for (const frase of negativas) {
    assertEquals(classificarRespostaIdentidade(frase, "Leandro"), "negou", frase);
  }
});

Deno.test("reconhece confirmacoes naturais sem confundir indisponibilidade", () => {
  for (const frase of ["Sim, sou eu", "Sou eu sim, pode falar", "Eu sou o Leandro", "Leandro falando"]) {
    assertEquals(classificarRespostaIdentidade(frase, "LEANDRO ARAUJO DA CRUZ"), "confirmou", frase);
  }
  for (const frase of ["Boa tarde!!!", "Não posso falar agora", "Quem gostaria?", "Do que se trata?"]) {
    assertEquals(classificarRespostaIdentidade(frase, "Leandro"), "indefinida", frase);
  }
});

Deno.test("mensagens de confirmacao usam o nome completo e variam", () => {
  assertEquals(primeiroNomeLegivel("LEANDRO ARAUJO DA CRUZ"), "Leandro");
  assertEquals(nomeCompletoLegivel("LEANDRO ARAUJO DA CRUZ"), "Leandro Araujo da Cruz");
  const primeira = respostaConfirmacaoIdentidade("LEANDRO ARAUJO DA CRUZ", 0, "Boa tarde!!!");
  const segunda = respostaConfirmacaoIdentidade("LEANDRO ARAUJO DA CRUZ", 1, "Boa tarde!!!");
  assertMatch(primeira, /^Boa tarde!/);
  assert(primeira.includes("Leandro Araujo da Cruz"));
  assertNotEquals(primeira, segunda);
});

Deno.test("detecta tentativas anteriores e varia encerramentos", () => {
  assert(ehPerguntaDeIdentidade("Falo com a pessoa certa?"));
  assert(ehPerguntaDeIdentidade("Você é LEANDRO ARAUJO DA CRUZ?"));
  assertNotEquals(respostaPessoaErrada(0), respostaPessoaErrada(1));
});
