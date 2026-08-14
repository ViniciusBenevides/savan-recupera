import { assert, assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import {
  classificarRespostaIdentidade,
  ehObjecaoConfirmacaoIdentidade,
  ehPedidoDocumentoOrigem,
  ehPedidoNaoPerturbe,
  ehPerguntaOrigemContato,
  ehRecusaSimplesNegociacao,
  ehPerguntaDeIdentidade,
  nomeCompletoLegivel,
  primeiroNomeLegivel,
  respostaConfirmacaoIdentidade,
  respostaContextoSeguroIdentidade,
  respostaLimiteIdentidade,
  respostaNaoPerturbe,
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
    "É irmã dela",
    "Sou a mãe dela",
    "Olá, irei passar o contato dela",
    "Oi não",
    "Não tem ninguém com esse nome aki não",
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
  assertEquals(classificarRespostaIdentidade("Pode sim", "Leandro"), "indefinida");
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

Deno.test("prioriza pedidos naturais de nao perturbacao", () => {
  for (const frase of [
    "Não manda mais mensagem no meu telefone",
    "Parem de me cobrar",
    "Retira meu número do cadastro",
    "Não quero mais receber mensagem",
  ]) assertEquals(ehPedidoNaoPerturbe(frase), true, frase);
  assertEquals(ehPedidoNaoPerturbe("Não lembro dessa compra"), false);
  assertMatch(respostaNaoPerturbe(), /encerrei o contato automático/);
});

Deno.test("identifica objecoes seguras, documentos e origem do telefone", () => {
  assert(ehObjecaoConfirmacaoIdentidade("Sobre o que é o assunto?"));
  assert(ehObjecaoConfirmacaoIdentidade("Como vou confirmar sem saber do que se trata?"));
  assert(ehPedidoDocumentoOrigem("Teria como mandar o comprovante da compra?"));
  assert(ehPerguntaOrigemContato("Como conseguiu meu número?"));
  assert(ehRecusaSimplesNegociacao("Não"));
  assertEquals(ehRecusaSimplesNegociacao("Não reconheço essa compra"), false);
  assertMatch(respostaContextoSeguroIdentidade("SILVANIA DE SOUSA"), /Silvania de Sousa/);
  assertMatch(respostaLimiteIdentidade(), /encerrei este atendimento automático/);
});
