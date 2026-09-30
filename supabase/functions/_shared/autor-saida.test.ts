import { assertEquals } from "jsr:@std/assert@1";
import { classificarAutorSaida, nomeDoAtendenteExterno } from "./autor-saida.ts";

// Formatos reais observados no chip 1 em 29/09/2026 (ids encurtados para não expor nada real).
const ID_DO_SISTEMA = "d25ca7e9-17a5-4c1e-9f3a-0b2c4d6e8f10";
const ID_DO_CELULAR = "A52E8216286730F1C2D3E4F5A6B7C8D9";

Deno.test("mensagem do sistema pelo baileys-api (UUID nosso) é do robô", () => {
  assertEquals(
    classificarAutorSaida({ senderType: null, sourceId: ID_DO_SISTEMA, conector: "baileys_chatwoot" }),
    { origem: "bot", pausarRobo: false, via: null },
  );
});

Deno.test("mensagem digitada no celular do chip é humana e pausa o robô", () => {
  assertEquals(
    classificarAutorSaida({ senderType: null, sourceId: ID_DO_CELULAR, conector: "baileys_chatwoot" }),
    { origem: "humano", pausarRobo: true, via: "celular" },
  );
});

Deno.test("na Evolution o formato do id não separa robô de celular: continua do robô", () => {
  for (const sourceId of [ID_DO_CELULAR, "3EB0C431D2F7A1B2C3D4", ID_DO_SISTEMA]) {
    assertEquals(
      classificarAutorSaida({ senderType: null, sourceId, conector: "baileys" }),
      { origem: "bot", pausarRobo: false, via: null },
      sourceId,
    );
  }
});

Deno.test("sem id de origem não há prova de humano", () => {
  assertEquals(
    classificarAutorSaida({ senderType: null, sourceId: "", conector: "baileys_chatwoot" }),
    { origem: "bot", pausarRobo: false, via: null },
  );
});

Deno.test("outro usuário do Chatwoot escrevendo pausa o robô", () => {
  assertEquals(
    classificarAutorSaida({ senderType: "user", senderId: 6, usuarioIntegracaoId: 1, conector: "baileys_chatwoot" }),
    { origem: "humano", pausarRobo: true, via: "chatwoot" },
  );
});

// O token das automações pertence a um usuário; mensagem dele pode ser o próprio sistema
// (reenvio, pós-pagamento). Pausar aqui calaria o robô com quem ninguém está atendendo.
Deno.test("o usuário da integração não pausa, e sem saber quem ele é também não", () => {
  assertEquals(
    classificarAutorSaida({ senderType: "user", senderId: 1, usuarioIntegracaoId: 1 }),
    { origem: "humano", pausarRobo: false, via: null },
  );
  assertEquals(
    classificarAutorSaida({ senderType: "user", senderId: 6, usuarioIntegracaoId: null }),
    { origem: "humano", pausarRobo: false, via: null },
  );
});

Deno.test("agent bot é robô", () => {
  assertEquals(
    classificarAutorSaida({ senderType: "agent_bot", sourceId: ID_DO_CELULAR, conector: "baileys_chatwoot" }),
    { origem: "bot", pausarRobo: false, via: null },
  );
});

Deno.test("nome de quem assumiu por fora do painel", () => {
  assertEquals(nomeDoAtendenteExterno("celular"), "Pelo celular do chip");
  assertEquals(nomeDoAtendenteExterno("chatwoot", "Maurélio"), "Maurélio");
  assertEquals(nomeDoAtendenteExterno("chatwoot", ""), "Chatwoot");
});
