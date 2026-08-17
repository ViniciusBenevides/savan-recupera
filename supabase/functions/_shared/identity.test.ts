import { assert, assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import {
  classificarRespostaIdentidade,
  ehAutorespostaComercial,
  ehAvisoDeFalecimento,
  ehIndicacaoDeContatoDeTerceiro,
  ehMencaoJuridica,
  ehMensagemSemConteudo,
  ehObjecaoConfirmacaoIdentidade,
  ehPedidoDocumentoOrigem,
  ehPedidoNaoPerturbe,
  ehPerguntaOrigemContato,
  ehRecusaSimplesNegociacao,
  ehPerguntaDeIdentidade,
  nomeCompletoLegivel,
  periodoDoDia,
  primeiroNomeLegivel,
  respostaConfirmacaoIdentidade,
  respostaContextoSeguroIdentidade,
  respostaLimiteIdentidade,
  respostaNaoPerturbe,
  respostaPessoaErrada,
  saudacaoDoPeriodo,
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
  // O período é passado explicitamente: a saudação segue o relógio, não a entrada.
  const primeira = respostaConfirmacaoIdentidade("LEANDRO ARAUJO DA CRUZ", 0, "Boa tarde!!!", [], "tarde");
  const segunda = respostaConfirmacaoIdentidade("LEANDRO ARAUJO DA CRUZ", 1, "Boa tarde!!!", [], "tarde");
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

// Regressao do loop de identidade: em conversas reais a mesma pergunta saiu quatro vezes porque
// duas das frases geradas nao eram reconhecidas como pergunta de identidade, e a contagem que
// dispara o limite de duas tentativas ficava travada em zero.
Deno.test("toda pergunta de identidade gerada e reconhecida de volta", () => {
  const jaEnviadas: string[] = [];
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const pergunta = respostaConfirmacaoIdentidade(
      "SILVANIA DE SOUSA", tentativa, "Oi", jaEnviadas, "tarde",
    );
    assert(ehPerguntaDeIdentidade(pergunta), `nao reconhecida: ${pergunta}`);
    assert(!jaEnviadas.includes(pergunta), `pergunta repetida: ${pergunta}`);
    jaEnviadas.push(pergunta);
  }
});

Deno.test("saudacao segue o relogio, nao o que a pessoa escreveu", () => {
  assertMatch(respostaConfirmacaoIdentidade("Leandro", 0, "Bom dia", [], "tarde"), /^Boa tarde!/);
  assertMatch(respostaConfirmacaoIdentidade("Leandro", 0, "Boa noite", [], "manha"), /^Bom dia!/);
  // sem cumprimento na entrada, nao inventa saudacao
  assert(!/^(Bom dia|Boa tarde|Boa noite)/.test(
    respostaConfirmacaoIdentidade("Leandro", 0, "Quem é?", [], "manha"),
  ));
  // 18:00Z = 15:00 em America/Sao_Paulo
  assertEquals(saudacaoDoPeriodo(periodoDoDia(new Date("2026-08-16T18:00:00Z"))), "Boa tarde");
  assertEquals(saudacaoDoPeriodo(periodoDoDia(new Date("2026-08-16T13:00:00Z"))), "Bom dia");
  assertEquals(saudacaoDoPeriodo(periodoDoDia(new Date("2026-08-16T23:00:00Z"))), "Boa noite");
});

Deno.test("negativas curtas e parentescos que caiam em indefinida", () => {
  for (const frase of [
    "Eu mesmo não",
    "Não esse número",
    "Não. Nem conheço ninguém com esse nome.",
    "Não ,não",
    "Nao aqui eo filho dele",
    "Sou ex esposa dele, e não tenho mais contato com ele",
  ]) assertEquals(classificarRespostaIdentidade(frase, "Leandro"), "negou", frase);
});

Deno.test("terceiro que oferece o contato do titular", () => {
  for (const frase of [
    "Olá, irei passar o contato dela",
    "irei te passar o número",
    "62991544479",
    "Esse aq e o contato dele",
    "Vou avisar ela",
  ]) assertEquals(ehIndicacaoDeContatoDeTerceiro(frase), true, frase);
  assertEquals(ehIndicacaoDeContatoDeTerceiro("Sim, sou eu"), false);
  assertEquals(ehIndicacaoDeContatoDeTerceiro("Quanto é o valor?"), false);
});

Deno.test("falecimento do titular", () => {
  for (const frase of [
    "O Victor agora dia 15 de agosto fazem nove meses que ele faleceu",
    "Ela é falecida",
    "Meu pai morreu ano passado",
  ]) assertEquals(ehAvisoDeFalecimento(frase), true, frase);
  assertEquals(ehAvisoDeFalecimento("Não conheço essa pessoa"), false);
});

Deno.test("resposta automatica de outra empresa nao e uma pessoa", () => {
  for (const frase of [
    "‎\"Olá ! Seja bem-vindo(a) ! A Celebre & Decor agradece seu contato. Como podemos tornar seu dia melhor ?\"",
    "O criatorio Jericó agradece o seu contato. Como podemos ajudar você?",
    "Olá, seja bem-vindo(a) à Clínica Dentista do Povo da Unidade de Rio Claro. Nosso horário de funcionamento é de segunda a sexta das 8:00h às 19:00h",
  ]) assertEquals(ehAutorespostaComercial(frase), true, frase);
  assertEquals(ehAutorespostaComercial("Oi, tudo bem? Sou eu sim"), false);
  assertEquals(ehAutorespostaComercial("Bom dia"), false);
});

Deno.test("mencao juridica encerra o automatico", () => {
  for (const frase of [
    "Eu vou processar vocês fazendo cobrança indevida",
    "eu vou dar parte desse número",
    "Vou levar no Procon",
    "Meu advogado vai entrar em contato",
    "Vou atrás dos meus direitos pq realmente nunca comprei nessa loja",
  ]) assertEquals(ehMencaoJuridica(frase), true, frase);
  assertEquals(ehMencaoJuridica("Não reconheço essa compra"), false);
});

Deno.test("mensagem sem conteudo nao consome tentativa", () => {
  for (const frase of ["👍", "kkkkk", "Jjjkjkkko", "", "🙏"]) {
    assertEquals(ehMensagemSemConteudo(frase), true, JSON.stringify(frase));
  }
  for (const frase of ["Sim", "Não", "Bom dia", "Quanto é?", "Sengehinik."]) {
    assertEquals(ehMensagemSemConteudo(frase), false, frase);
  }
});

Deno.test("pedidos de exclusao em linguagem natural", () => {
  for (const frase of [
    "Poderiam tirar meu telefone do cadastro por favor?",
    "Não precisa bloqueia meu telefone",
    "Me tira dessa lista",
    "Quero ser excluído do cadastro",
    "Para de me mandar mensagem",
    "Pare de me cobrar",
    "Chega de mensagem",
  ]) assertEquals(ehPedidoNaoPerturbe(frase), true, frase);
});

// A preposicao "para" nao pode ser lida como o imperativo "para (de)". Esta frase e de uma
// conversa real (conv 469) em que a pessoa estava combinando como PAGAR — registrar opt-out ali
// mataria uma negociacao fechada.
Deno.test("preposicao para nao dispara opt-out", () => {
  for (const frase of [
    "Pois é tem até dia 20 né pode ser ou também o outro negócio aí para mandar né para fazer o pagamento quando a minha filha é perto aqui de mim eu pego para ela fazer o pagamento",
    "Vou pedir para minha filha para mandar o pix",
    "Me passa os dados para enviar o pagamento",
    "Qual número para ligar?",
    "Tem alguém para cobrar isso direito?",
  ]) assertEquals(ehPedidoNaoPerturbe(frase), false, frase);
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
