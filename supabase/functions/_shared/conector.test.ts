import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  chipPodeAbordar,
  conectorDoChip,
  ehConectorBaileys,
  ehConectorSuportado,
  nomeInstanciaEvolution,
} from "./conector.ts";

Deno.test("conector ausente cai no padrao baileys", () => {
  assertEquals(conectorDoChip({}), "baileys");
  assertEquals(conectorDoChip({ conector: null }), "baileys");
  assertEquals(conectorDoChip({ conector: "  " }), "baileys");
});

Deno.test("conector conhecido e preservado, desconhecido cai no padrao", () => {
  assertEquals(conectorDoChip({ conector: "meta_cloud" }), "meta_cloud");
  assertEquals(conectorDoChip({ conector: "BAILEYS" }), "baileys");
  assertEquals(conectorDoChip({ conector: "zap_qualquer" }), "baileys");
});

Deno.test("ehConectorSuportado aceita so os tres valores do check do banco", () => {
  assertEquals(ehConectorSuportado("baileys"), true);
  assertEquals(ehConectorSuportado("baileys_chatwoot"), true);
  assertEquals(ehConectorSuportado("meta_cloud"), true);
  assertEquals(ehConectorSuportado("zap_qualquer"), false);
  assertEquals(ehConectorSuportado(""), false);
});

Deno.test("ehConectorBaileys agrupa os dois transportes nao-oficiais", () => {
  assertEquals(ehConectorBaileys("baileys"), true);
  assertEquals(ehConectorBaileys("baileys_chatwoot"), true);
  assertEquals(ehConectorBaileys("meta_cloud"), false);
});

Deno.test("nome de instancia e um slug estavel e unico por chip", () => {
  assertEquals(nomeInstanciaEvolution("Chip 1 — Goiás", 7), "chip-1-goias-7");
  assertEquals(nomeInstanciaEvolution("  ", 12), "chip-12");
  assertEquals(nomeInstanciaEvolution("A/B\\C:D", 3), "a-b-c-d-3");
});

Deno.test("nome de instancia nao passa de 48 caracteres", () => {
  const gerado = nomeInstanciaEvolution("n".repeat(200), 99);
  assertEquals(gerado.length <= 48, true);
  assertEquals(gerado.endsWith("-99"), true);
});

Deno.test("nome de instancia exige id de chip valido", () => {
  assertThrows(() => nomeInstanciaEvolution("Chip", 0));
  assertThrows(() => nomeInstanciaEvolution("Chip", -1));
});

Deno.test("chip baileys so aborda com instancia definida", () => {
  assertEquals(
    chipPodeAbordar({ conector: "baileys", papel: "bot", instancia_evolution: "chip-1" }),
    { pode: true },
  );
  assertEquals(
    chipPodeAbordar({ conector: "baileys", papel: "bot", instancia_evolution: null }),
    { pode: false, motivo: "sem_instancia_evolution" },
  );
});

Deno.test("chip baileys_chatwoot so aborda com numero_e164 definido", () => {
  assertEquals(
    chipPodeAbordar({ conector: "baileys_chatwoot", papel: "bot", numero_e164: "+5562982624555" }),
    { pode: true },
  );
  assertEquals(
    chipPodeAbordar({ conector: "baileys_chatwoot", papel: "bot", numero_e164: null }),
    { pode: false, motivo: "sem_numero_e164" },
  );
  // instancia_evolution nao importa para este conector — o identificador e o numero
  assertEquals(
    chipPodeAbordar({
      conector: "baileys_chatwoot", papel: "bot",
      numero_e164: "+5562982624555", instancia_evolution: null,
    }),
    { pode: true },
  );
});

Deno.test("chip meta_cloud nao aborda: canal suspenso", () => {
  assertEquals(
    chipPodeAbordar({ conector: "meta_cloud", papel: "bot", instancia_evolution: null }),
    { pode: false, motivo: "canal_meta_suspenso" },
  );
});

Deno.test("chip de equipe nunca aborda: escalador so recebe", () => {
  assertEquals(
    chipPodeAbordar({ conector: "baileys", papel: "equipe", instancia_evolution: "chip-9" }),
    { pode: false, motivo: "chip_de_equipe" },
  );
});
