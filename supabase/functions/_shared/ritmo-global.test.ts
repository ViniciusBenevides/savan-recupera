import { assertEquals } from "jsr:@std/assert@1";
import { avaliarFreioGlobal, lerFreioGlobal } from "./ritmo-global.ts";

Deno.test("sem config, o freio esta desligado: o padrao nao freia ninguem", () => {
  assertEquals(lerFreioGlobal(undefined), { ativo: false, msgs_hora: null });
  assertEquals(lerFreioGlobal(null), { ativo: false, msgs_hora: null });
  assertEquals(lerFreioGlobal({}), { ativo: false, msgs_hora: null });
});

Deno.test("freio so vale com ativo true E teto numerico valido", () => {
  assertEquals(lerFreioGlobal({ ativo: true, msgs_hora: 6 }), { ativo: true, msgs_hora: 6 });
  assertEquals(lerFreioGlobal({ ativo: true }), { ativo: false, msgs_hora: null });
  assertEquals(lerFreioGlobal({ ativo: false, msgs_hora: 6 }), { ativo: false, msgs_hora: 6 });
  assertEquals(lerFreioGlobal({ ativo: true, msgs_hora: 0 }), { ativo: false, msgs_hora: null });
  assertEquals(lerFreioGlobal({ ativo: true, msgs_hora: -3 }), { ativo: false, msgs_hora: null });
  assertEquals(lerFreioGlobal({ ativo: true, msgs_hora: "seis" }), { ativo: false, msgs_hora: null });
});

Deno.test("freio desligado nunca limita, nem com a hora cheia", () => {
  const r = avaliarFreioGlobal({ ativo: false, msgs_hora: null }, 999);
  assertEquals(r, { pode: true, restante: null });
});

Deno.test("freio ligado devolve quanto ainda cabe na hora", () => {
  assertEquals(avaliarFreioGlobal({ ativo: true, msgs_hora: 6 }, 0), { pode: true, restante: 6 });
  assertEquals(avaliarFreioGlobal({ ativo: true, msgs_hora: 6 }, 4), { pode: true, restante: 2 });
});

Deno.test("no teto, fecha", () => {
  assertEquals(avaliarFreioGlobal({ ativo: true, msgs_hora: 6 }, 6), { pode: false, restante: 0 });
});

Deno.test("acima do teto, o restante nunca fica negativo", () => {
  assertEquals(avaliarFreioGlobal({ ativo: true, msgs_hora: 6 }, 10), { pode: false, restante: 0 });
});
