import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  classificarErroEnvio,
  estadoConexaoParaStatus,
  numeroParaJid,
  tempoDigitacao,
} from "./evolution.ts";

// ── numeroParaJid ────────────────────────────────────────────────────────────────────────

Deno.test("numeroParaJid limpa a formatacao e monta o JID de telefone", () => {
  assertEquals(numeroParaJid("+55 62 98257-5799"), "5562982575799@s.whatsapp.net");
  assertEquals(numeroParaJid("5562982575799"), "5562982575799@s.whatsapp.net");
  assertEquals(numeroParaJid("+55 (62) 9 8257-5799"), "5562982575799@s.whatsapp.net");
});

Deno.test("numeroParaJid recusa numero vazio ou sem digito", () => {
  assertThrows(() => numeroParaJid(""));
  assertThrows(() => numeroParaJid("+"));
  assertThrows(() => numeroParaJid("abc"));
});

// ── tempoDigitacao ───────────────────────────────────────────────────────────────────────

Deno.test("tempo de digitacao cresce com o tamanho do texto", () => {
  const curto = tempoDigitacao("oi", () => 0.5);
  const longo = tempoDigitacao("o".repeat(200), () => 0.5);
  assertEquals(longo > curto, true);
});

Deno.test("tempo de digitacao respeita o piso: ninguem responde instantaneo", () => {
  assertEquals(tempoDigitacao("oi", () => 0.5) >= 1200, true);
  assertEquals(tempoDigitacao("", () => 0.5) >= 1200, true);
});

Deno.test("tempo de digitacao respeita o teto: ninguem digita um minuto", () => {
  assertEquals(tempoDigitacao("o".repeat(5000), () => 0.5) <= 15000, true);
  assertEquals(tempoDigitacao("o".repeat(5000), () => 1) <= 15000, true);
});

Deno.test("a variacao e deterministica quando o random e injetado", () => {
  const texto = "uma mensagem de tamanho medio para o robo digitar";
  assertEquals(tempoDigitacao(texto, () => 0.5), tempoDigitacao(texto, () => 0.5));
  const baixo = tempoDigitacao(texto, () => 0);
  const alto = tempoDigitacao(texto, () => 1);
  assertEquals(baixo < alto, true);
});

Deno.test("tempo de digitacao e sempre inteiro: a Evolution espera ms inteiro", () => {
  for (const r of [0, 0.31, 0.5, 0.77, 1]) {
    const ms = tempoDigitacao("texto qualquer para variar", () => r);
    assertEquals(Number.isInteger(ms), true);
  }
});

// ── classificarErroEnvio — a licao do §36 ────────────────────────────────────────────────

Deno.test("erro desconhecido e falha, NUNCA sem_whatsapp", () => {
  assertEquals(classificarErroEnvio(500, { erro: "boom" }), "falha");
  assertEquals(classificarErroEnvio(502, null), "falha");
  assertEquals(classificarErroEnvio(200, null), "falha");
  assertEquals(classificarErroEnvio(400, { response: { message: ["coisa estranha"] } }), "falha");
});

Deno.test("so sinal explicito de numero inexistente vira sem_whatsapp", () => {
  assertEquals(
    classificarErroEnvio(400, { response: { message: ["number is not on whatsapp"] } }),
    "sem_whatsapp",
  );
  assertEquals(
    classificarErroEnvio(400, { response: { message: ["Number does not exist on WhatsApp"] } }),
    "sem_whatsapp",
  );
  assertEquals(classificarErroEnvio(400, { exists: false }), "sem_whatsapp");
  // O corpo REAL da Evolution 2.3.7, conferido contra a instancia em 01/09/2026. O `exists` vem
  // aninhado dentro de `response.message[]` — nunca na raiz, que era o que este teste supunha.
  assertEquals(
    classificarErroEnvio(400, {
      status: 400,
      error: "Bad Request",
      response: { message: [{ jid: "5562993979330@s.whatsapp.net", exists: false, number: "5562993979330" }] },
    }),
    "sem_whatsapp",
  );
});

Deno.test("exists ausente ou nao-booleano continua sendo falha (fecha fechado)", () => {
  assertEquals(classificarErroEnvio(400, { response: { message: [{ jid: "x@s.whatsapp.net" }] } }), "falha");
  assertEquals(classificarErroEnvio(400, { response: { message: [{ exists: "false" }] } }), "falha");
  assertEquals(classificarErroEnvio(400, { response: { message: [{ exists: null }] } }), "falha");
  assertEquals(classificarErroEnvio(400, { response: { message: [{ exists: true }] } }), "falha");
});

Deno.test("instancia fora do ar e chip_caido, nao falha do numero", () => {
  assertEquals(classificarErroEnvio(401, { error: "Unauthorized" }), "chip_caido");
  assertEquals(
    classificarErroEnvio(400, { response: { message: ["instance not connected"] } }),
    "chip_caido",
  );
  assertEquals(
    classificarErroEnvio(404, { response: { message: ["instance does not exist"] } }),
    "chip_caido",
  );
});

Deno.test("rate limit manda retentar, nao queimar o item da fila", () => {
  assertEquals(classificarErroEnvio(429, null), "retentar");
});

// ── estadoConexaoParaStatus ──────────────────────────────────────────────────────────────

Deno.test("open vira conectado e connecting vira cadastrado", () => {
  assertEquals(estadoConexaoParaStatus("open"), "conectado");
  assertEquals(estadoConexaoParaStatus("connecting"), "cadastrado");
});

Deno.test("close com 401 vira banido: reconectar nao resolve", () => {
  assertEquals(estadoConexaoParaStatus("close", 401), "banido");
});

Deno.test("close por outro motivo e so desconectado: pode reconectar", () => {
  assertEquals(estadoConexaoParaStatus("close", 428), "desconectado");
  assertEquals(estadoConexaoParaStatus("close"), "desconectado");
  assertEquals(estadoConexaoParaStatus("qualquer_outra_coisa"), "desconectado");
});
