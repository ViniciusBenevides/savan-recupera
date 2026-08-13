import { assertEquals } from "jsr:@std/assert@1";
import { ehEstadoTerminal } from "./conversation-state.ts";

Deno.test("estados com desfecho nunca reativam o bot", () => {
  for (const estado of ["encerrada", "optout", "pago"]) {
    assertEquals(ehEstadoTerminal(estado), true, estado);
  }
});

Deno.test("estados em andamento continuam processaveis", () => {
  for (const estado of ["aguardando_resposta", "bot_ativo", "humano", "pix_enviado", null]) {
    assertEquals(ehEstadoTerminal(estado), false, String(estado));
  }
});
