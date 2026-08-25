import { assertEquals } from "jsr:@std/assert@1";
import { classificarBalde, podeAbordar } from "./baldes.ts";

Deno.test("quem recusou nunca mais, mesmo tendo respondido antes", () => {
  assertEquals(
    classificarBalde({ respondeu: true, bloqueado: true, jaAbordado: true }),
    "nunca_mais",
  );
});

Deno.test("bloqueio vence tudo, inclusive quem nunca foi abordado", () => {
  assertEquals(
    classificarBalde({ respondeu: false, bloqueado: true, jaAbordado: false }),
    "nunca_mais",
  );
});

Deno.test("quem respondeu recebe continuidade", () => {
  assertEquals(
    classificarBalde({ respondeu: true, bloqueado: false, jaAbordado: true }),
    "recontato_continuidade",
  );
});

Deno.test("quem foi abordado e nunca respondeu volta como primeira vez", () => {
  assertEquals(
    classificarBalde({ respondeu: false, bloqueado: false, jaAbordado: true }),
    "primeira_vez",
  );
});

Deno.test("quem nunca foi abordado tambem e primeira vez", () => {
  assertEquals(
    classificarBalde({ respondeu: false, bloqueado: false, jaAbordado: false }),
    "primeira_vez",
  );
});

Deno.test("so o balde nunca_mais barra a abordagem", () => {
  assertEquals(podeAbordar("recontato_continuidade"), true);
  assertEquals(podeAbordar("primeira_vez"), true);
  assertEquals(podeAbordar("nunca_mais"), false);
});
