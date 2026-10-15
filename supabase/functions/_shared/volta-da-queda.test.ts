import { assertEquals } from "jsr:@std/assert@1";
import { statusNaVolta } from "./volta-da-queda.ts";

Deno.test("chip que abordava volta pausado, nunca ativo", () => {
  assertEquals(statusNaVolta("ativo"), "pausado");
  assertEquals(statusNaVolta("aquecendo"), "pausado");
  assertEquals(statusNaVolta("pausado"), "pausado");
});

Deno.test("chip só conectado volta conectado", () => {
  assertEquals(statusNaVolta("conectado"), "conectado");
});

Deno.test("sem status_antes conhecido o chip fica como está", () => {
  for (const s of [null, undefined, "", "desconectado", "cadastrado", "banido"]) {
    assertEquals(statusNaVolta(s), null);
  }
});
