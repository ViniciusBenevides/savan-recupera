import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { formatarReais, respostaPixDireto } from "./pix-direto.ts";

Deno.test("mensagem do Pix direto diz valor, validade e que o código vem separado", () => {
  const texto = respostaPixDireto({ valor: "R$ 77,00", validoAte: "01/10/2026", avisarVoluntario: true });
  assertMatch(texto, /Pix de R\$ 77,00, válido até 01\/10\/2026/);
  assertMatch(texto, /próxima mensagem, sozinho/);
  assertMatch(texto, /pagamento é voluntário/);
  assertMatch(texto, /termo de quitação/);
});

Deno.test("carteira que não fala de prescrição não recebe o aviso de voluntário", () => {
  const texto = respostaPixDireto({ valor: "R$ 77,00", validoAte: null, avisarVoluntario: false });
  assert(!/prescrita|voluntário/.test(texto));
  assert(!/válido até/.test(texto));
});

// O Pix direto sai antes de confirmar quem é: o texto não pode carregar nada além do valor.
Deno.test("mensagem do Pix direto não cita CPF, origem nem nome", () => {
  const texto = respostaPixDireto({ valor: "R$ 77,00", validoAte: "01/10/2026", avisarVoluntario: true });
  assert(!/cpf|savan|loja|compra|vencimento|protocolo/i.test(texto));
});

Deno.test("formata reais como o disparador", () => {
  assertEquals(formatarReais(77).replace(/\s/g, " "), "R$ 77,00");
  assertEquals(formatarReais("1234.5").replace(/\s/g, " "), "R$ 1.234,50");
  assertEquals(formatarReais("abc"), "");
});
