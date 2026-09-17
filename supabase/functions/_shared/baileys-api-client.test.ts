import { assertEquals } from "jsr:@std/assert@1";
import {
  aguardarAckBaileysApi,
  classificarErroEnvioBaileysApi,
  consultarBloqueioBaileysApi,
  saudeConexaoBaileysApi,
  variantesE164Br,
} from "./baileys-api-client.ts";

// A doc oficial do baileys-api (fazer-ai) é explícita sobre dois pontos que estes testes travam:
//
// - 404 = "Phone number not connected" → chip_caido de verdade.
// - 503 = circuit breaker aberto / mutex de keystore travado → a doc AVISA que a conexão está de
//   pé e NÃO deve ser marcada como caída. Errar isso aqui derruba chip saudável.
//
// 409/504 têm resultado indeterminado (mensagem pode ter saído sem confirmação) — não podem virar
// `chip_caido` nem `retentar`, porque o `campanha-registrar` só reenfileira erro CERTO de nada ter
// saído (§31: reenviar em dobro é padrão de robô).

Deno.test("404 - telefone nao conectado - e chip_caido", () => {
  assertEquals(classificarErroEnvioBaileysApi(404), "chip_caido");
});

Deno.test("503 - circuit breaker/mutex - e retentar, NUNCA chip_caido", () => {
  assertEquals(classificarErroEnvioBaileysApi(503), "retentar");
});

Deno.test("421 - misdirected em modo cluster - e retentar", () => {
  assertEquals(classificarErroEnvioBaileysApi(421), "retentar");
});

Deno.test("409 e 504 - resultado indeterminado - caem em falha, nao em retentar", () => {
  assertEquals(classificarErroEnvioBaileysApi(409), "falha");
  assertEquals(classificarErroEnvioBaileysApi(504), "falha");
});

Deno.test("403 e 500 tambem caem em falha", () => {
  assertEquals(classificarErroEnvioBaileysApi(403), "falha");
  assertEquals(classificarErroEnvioBaileysApi(500), "falha");
});

Deno.test("falha fechada: codigo desconhecido nunca vira chip_caido nem retentar", () => {
  assertEquals(classificarErroEnvioBaileysApi(418), "falha");
  assertEquals(classificarErroEnvioBaileysApi(0), "falha");
});

// `lastOutgoingAckAgoMs` é o sinal do incidente de 03/09/2026 (chip 1 conectado, enviando, e o
// WhatsApp nunca confirmando) — antes destes testes o campo nem era lido pelo client.
Deno.test("saudeConexaoBaileysApi le lastOutgoingAckAgoMs e lastSendCompletedAgoMs do /health", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          data: {
            connected: true, sendState: "ok", consecutiveSendTimeouts: 0,
            lastOutgoingAckAgoMs: null, lastSendCompletedAgoMs: 1430468,
          },
        }),
        { status: 200 },
      ),
    )) as typeof fetch;
  try {
    const r = await saudeConexaoBaileysApi({ url: "https://x", apiKey: "k" }, "+5562982624555");
    assertEquals(r.ok, true);
    assertEquals(r.connected, true);
    assertEquals(r.ultimoAckAgoMs, null);
    assertEquals(r.ultimoEnvioCompletoAgoMs, 1430468);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("saudeConexaoBaileysApi: ack presente vira numero, nao fica preso em null", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ data: { connected: true, sendState: "ok", lastOutgoingAckAgoMs: 4200 } }),
        { status: 200 },
      ),
    )) as typeof fetch;
  try {
    const r = await saudeConexaoBaileysApi({ url: "https://x", apiKey: "k" }, "+5562982624555");
    assertEquals(r.ultimoAckAgoMs, 4200);
    assertEquals(r.ultimoEnvioCompletoAgoMs, null);
  } finally {
    globalThis.fetch = original;
  }
});

// Caso real do incidente de 03/09/2026: +5564999185731 (Amanda) nunca chegou; +556499185731 (sem
// o 9) chegou na hora quando testado manualmente pelo Chatwoot.
Deno.test("variantesE164Br: celular BR de 9 digitos tenta PRIMEIRO sem o 9 extra", () => {
  assertEquals(variantesE164Br("+5564999185731"), ["+556499185731", "+5564999185731"]);
});

Deno.test("variantesE164Br: numero BR de 8 digitos ganha alternativa COM o 9", () => {
  assertEquals(variantesE164Br("+556499185731"), ["+556499185731", "+5564999185731"]);
});

Deno.test("variantesE164Br: numero fora do Brasil nao ganha alternativa", () => {
  assertEquals(variantesE164Br("+14155552671"), ["+14155552671"]);
});

Deno.test("variantesE164Br: BR fora do formato DDD+8/9 nao ganha alternativa", () => {
  assertEquals(variantesE164Br("+551234"), ["+551234"]);
});

Deno.test("aguardarAckBaileysApi: ack novo dentro da janela vira true", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ data: { connected: true, lastOutgoingAckAgoMs: 5 } }), { status: 200 }),
    )) as typeof fetch;
  try {
    const ok = await aguardarAckBaileysApi(
      { url: "https://x", apiKey: "k" }, "+5562982624555",
      { tentativas: 2, intervaloMs: 5 },
    );
    assertEquals(ok, true);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("aguardarAckBaileysApi: sem ack novo depois de esgotar as tentativas vira false", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ data: { connected: true, lastOutgoingAckAgoMs: null } }), { status: 200 }),
    )) as typeof fetch;
  try {
    const ok = await aguardarAckBaileysApi(
      { url: "https://x", apiKey: "k" }, "+5562982624555",
      { tentativas: 2, intervaloMs: 5 },
    );
    assertEquals(ok, false);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("aguardarAckBaileysApi: ack antigo (de antes desta espera) NAO conta como novo", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      // 10 minutos de idade — muito mais velho que a janela de espera do teste (poucos ms)
      new Response(JSON.stringify({ data: { connected: true, lastOutgoingAckAgoMs: 600_000 } }), { status: 200 }),
    )) as typeof fetch;
  try {
    const ok = await aguardarAckBaileysApi(
      { url: "https://x", apiKey: "k" }, "+5562982624555",
      { tentativas: 2, intervaloMs: 5 },
    );
    assertEquals(ok, false);
  } finally {
    globalThis.fetch = original;
  }
});

// Bloqueio de alcance (16/09/2026): o endpoint devolve o estado do WhatsApp em camelCase, com a data
// ja serializada. 404 e "nao conectado" — dado, nao falha — e nao pode virar "sem bloqueio".
async function comFetch<T>(resposta: () => Response, fn: (urls: string[]) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((u: string | URL | Request) => {
    urls.push(String(u));
    return Promise.resolve(resposta());
  }) as typeof fetch;
  try {
    return await fn(urls);
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("consultarBloqueioBaileysApi le o bloqueio ativo e chama o endpoint certo", async () => {
  const fim = new Date(Date.now() + 3 * 3600_000).toISOString();
  await comFetch(
    () => new Response(JSON.stringify({ data: { isActive: true, enforcementType: "RESTRICT_ALL_COMPANIONS", timeEnforcementEnds: fim } }), { status: 200 }),
    async (urls) => {
      const r = await consultarBloqueioBaileysApi({ url: "https://x", apiKey: "k" }, "+5562900000001");
      assertEquals(urls, ["https://x/connections/%2B5562900000001/reachout-timelock"]);
      assertEquals(r.ok, true);
      assertEquals(r.connected, true);
      assertEquals(r.bloqueio?.ativo, true);
      assertEquals(r.bloqueio?.ate, fim);
      assertEquals(r.bloqueio?.tipo, "RESTRICT_ALL_COMPANIONS");
    },
  );
});

Deno.test("consultarBloqueioBaileysApi: liberado e ativo false", async () => {
  await comFetch(
    () => new Response(JSON.stringify({ data: { isActive: false, enforcementType: "DEFAULT" } }), { status: 200 }),
    async () => {
      const r = await consultarBloqueioBaileysApi({ url: "https://x", apiKey: "k" }, "+5562900000002");
      assertEquals(r.ok, true);
      assertEquals(r.bloqueio?.ativo, false);
    },
  );
});

Deno.test("consultarBloqueioBaileysApi: 404 e chip nao conectado, sem opiniao sobre bloqueio", async () => {
  await comFetch(
    () => new Response("Phone number not connected", { status: 404 }),
    async () => {
      const r = await consultarBloqueioBaileysApi({ url: "https://x", apiKey: "k" }, "+5562900000001");
      assertEquals(r, { ok: true, connected: false, bloqueio: null });
    },
  );
});

Deno.test("consultarBloqueioBaileysApi: 500 ou corpo ilegivel e consulta que falhou", async () => {
  await comFetch(() => new Response("boom", { status: 500 }), async () => {
    const r = await consultarBloqueioBaileysApi({ url: "https://x", apiKey: "k" }, "+5562900000001");
    assertEquals(r, { ok: false, connected: null, bloqueio: null });
  });
  await comFetch(() => new Response(JSON.stringify({ data: null }), { status: 200 }), async () => {
    const r = await consultarBloqueioBaileysApi({ url: "https://x", apiKey: "k" }, "+5562900000001");
    assertEquals(r.ok, false);
    assertEquals(r.bloqueio, null);
  });
});
