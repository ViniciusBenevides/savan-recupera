import { assertEquals } from "jsr:@std/assert@1";
import { extrairMarcadorEtapa } from "./marcador-etapa.ts";

const ids = new Set(["pagamento", "sem_condicoes", "agendar_retorno"]);

Deno.test("marcador sozinho na última linha sai do texto e move a conversa", () => {
  const r = extrairMarcadorEtapa("Prontinho!\nPROXIMA_ETAPA: pagamento", ids);
  assertEquals(r, { texto: "Prontinho!", proxima: "pagamento" });
});

// O caso real de 29/09: o marcador no fim da mesma linha da pergunta foi enviado ao devedor.
Deno.test("marcador na mesma linha da pergunta também sai", () => {
  const r = extrairMarcadorEtapa("Posso gerar o código Pix para você quitar? PROXIMA_ETAPA: pagamento", ids);
  assertEquals(r, { texto: "Posso gerar o código Pix para você quitar?", proxima: "pagamento" });
});

Deno.test("variações que o modelo escreve", () => {
  for (const [entrada, esperado] of [
    ["Tudo certo. **PROXIMA_ETAPA:** sem_condicoes", "sem_condicoes"],
    ["Tudo certo. `PROXIMA_ETAPA: sem_condicoes`", "sem_condicoes"],
    ["Tudo certo. PRÓXIMA_ETAPA: sem_condicoes.", "sem_condicoes"],
    ["Tudo certo. (PROXIMA ETAPA: agendar_retorno)", "agendar_retorno"],
    ["Tudo certo. proxima_etapa: Pagamento", "pagamento"],
  ] as const) {
    assertEquals(extrairMarcadorEtapa(entrada, ids), { texto: "Tudo certo.", proxima: esperado }, entrada);
  }
});

Deno.test("etapa que não existe some do texto, mas não move a conversa", () => {
  assertEquals(extrairMarcadorEtapa("Ok! PROXIMA_ETAPA: etapa_inventada", ids), { texto: "Ok!", proxima: null });
  assertEquals(extrairMarcadorEtapa("Ok! PROXIMA_ETAPA:", ids), { texto: "Ok!", proxima: null });
});

Deno.test("texto sem marcador passa intacto, com as quebras de parágrafo", () => {
  const texto = "Primeiro parágrafo.\n\nSegundo: com dois-pontos e hífen.";
  assertEquals(extrairMarcadorEtapa(texto, ids), { texto, proxima: null });
});

Deno.test("“próxima etapa” escrito em português normal não é confundido com o marcador", () => {
  const texto = "A próxima etapa: gerar o Pix. Na Próxima Etapa - pagamento - você recebe o termo.";
  assertEquals(extrairMarcadorEtapa(texto, ids), { texto, proxima: null });
});

Deno.test("variações que ainda vazavam na revisão de 30/09", () => {
  for (const [entrada, esperado] of [
    ["Ok. PROXIMA_ETAPA: <pagamento>", "pagamento"],
    ["Ok. PROXIMA_ETAPA: ‘agendar_retorno’", "agendar_retorno"],
    ["Ok. PROXIMA_ETAPA — pagamento", "pagamento"],
    ["Ok. PROXIMA_ETAPA → pagamento", "pagamento"],
    ["Ok. PROXIMA_ETAPA -> pagamento", "pagamento"],
    ["Ok. PROXIMA_ETAPA: pagamento", "pagamento"],
    ["Ok. PROXIMA_ETAPA: _pagamento_", "pagamento"],
  ] as const) {
    assertEquals(extrairMarcadorEtapa(entrada, ids), { texto: "Ok.", proxima: esperado }, entrada);
  }
});

// Os ids são português sem acento; o modelo às vezes os escreve com acento. Antes vazava o pedaço
// depois do acento ("ções") e a conversa ficava presa.
Deno.test("id escrito com acento é reconhecido e não vaza pedaço", () => {
  const comAcento = new Set(["sem_condicoes", "confirmacao_pagamento", "duvida_prescricao"]);
  assertEquals(
    extrairMarcadorEtapa("Entendo sua situação. PROXIMA_ETAPA: sem_condições", comAcento),
    { texto: "Entendo sua situação.", proxima: "sem_condicoes" },
  );
  assertEquals(
    extrairMarcadorEtapa("Certo.\nPROXIMA_ETAPA: dúvida_prescrição", comAcento),
    { texto: "Certo.", proxima: "duvida_prescricao" },
  );
});

// O regex anterior era cúbico numa sequência longa de espaços: 4 mil espaços levavam 15 s, e a Edge
// Function tem 2 s de CPU. Uma resposta degenerada do modelo derrubaria o turno.
Deno.test("sequência enorme de espaços ou de sublinhados não trava", () => {
  const inicio = performance.now();
  extrairMarcadorEtapa(`PROXIMA_ETAPA: pagamento${" ".repeat(20000)}x${"\t ".repeat(5000)}fim`, ids);
  extrairMarcadorEtapa(`${"_".repeat(50000)} PROXIMA_ETAPA: pagamento`, ids);
  extrairMarcadorEtapa(`${" ".repeat(20000)}sem marcador nenhum`, ids);
  const ms = performance.now() - inicio;
  if (ms > 500) throw new Error(`levou ${ms.toFixed(0)} ms`);
});

Deno.test("texto sem marcador sai exatamente como veio", () => {
  const texto = "Valor: R$ 40,91 — vence 06/10.  Duas  espaços aqui ficam.";
  assertEquals(extrairMarcadorEtapa(texto, ids), { texto, proxima: null });
});

Deno.test("marcador no meio de parágrafos não deixa linha em branco sobrando", () => {
  const r = extrairMarcadorEtapa("Linha um.\nPROXIMA_ETAPA: pagamento\n\n\nLinha dois.", ids);
  assertEquals(r, { texto: "Linha um.\n\nLinha dois.", proxima: "pagamento" });
});
