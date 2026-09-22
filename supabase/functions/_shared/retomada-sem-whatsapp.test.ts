import { assertEquals } from "jsr:@std/assert@1";
import {
  MAX_RETOMADAS_HORA,
  RETOMADA_MAX_S,
  RETOMADA_MIN_S,
  retomadaAposSemWhatsapp,
} from "./retomada-sem-whatsapp.ts";

const AGORA = Date.parse("2026-09-22T18:53:20Z");
const HORA_CHEIA = new Date(AGORA + 63 * 60_000).toISOString();

Deno.test("chip de 1/h: a vaga volta em 5 a 10 min, nao na hora cheia", () => {
  const menor = retomadaAposSemWhatsapp({ proximoDisparoEm: HORA_CHEIA, agoraMs: AGORA, semWhatsappNaHora: 1, sorteio: () => 0 });
  const maior = retomadaAposSemWhatsapp({ proximoDisparoEm: HORA_CHEIA, agoraMs: AGORA, semWhatsappNaHora: 1, sorteio: () => 0.9999999 });
  assertEquals(menor, new Date(AGORA + RETOMADA_MIN_S * 1000).toISOString());
  assertEquals(maior, new Date(AGORA + RETOMADA_MAX_S * 1000).toISOString());
});

Deno.test("sorteio fora de [0,1) nao escapa da faixa", () => {
  const acima = retomadaAposSemWhatsapp({ proximoDisparoEm: HORA_CHEIA, agoraMs: AGORA, semWhatsappNaHora: 1, sorteio: () => 1 });
  const abaixo = retomadaAposSemWhatsapp({ proximoDisparoEm: HORA_CHEIA, agoraMs: AGORA, semWhatsappNaHora: 1, sorteio: () => -1 });
  assertEquals(acima, new Date(AGORA + RETOMADA_MAX_S * 1000).toISOString());
  assertEquals(abaixo, new Date(AGORA + RETOMADA_MIN_S * 1000).toISOString());
});

Deno.test("passou do teto de retomadas na hora: volta ao ritmo normal", () => {
  const no = retomadaAposSemWhatsapp({ proximoDisparoEm: HORA_CHEIA, agoraMs: AGORA, semWhatsappNaHora: MAX_RETOMADAS_HORA, sorteio: () => 0 });
  const acima = retomadaAposSemWhatsapp({ proximoDisparoEm: HORA_CHEIA, agoraMs: AGORA, semWhatsappNaHora: MAX_RETOMADAS_HORA + 1, sorteio: () => 0 });
  assertEquals(typeof no, "string");
  assertEquals(acima, null);
});

Deno.test("contagem invalida falha fechada: nao encurta", () => {
  assertEquals(retomadaAposSemWhatsapp({ proximoDisparoEm: HORA_CHEIA, agoraMs: AGORA, semWhatsappNaHora: NaN, sorteio: () => 0 }), null);
});

Deno.test("ritmo rapido (reserva menor que 5 min) nao muda: nunca estica a reserva", () => {
  const tresMin = new Date(AGORA + 3 * 60_000).toISOString();
  assertEquals(retomadaAposSemWhatsapp({ proximoDisparoEm: tresMin, agoraMs: AGORA, semWhatsappNaHora: 1, sorteio: () => 0 }), null);
});

Deno.test("reserva ja vencida ou ausente: o chip esta livre, nada a devolver", () => {
  const passada = new Date(AGORA - 60_000).toISOString();
  assertEquals(retomadaAposSemWhatsapp({ proximoDisparoEm: passada, agoraMs: AGORA, semWhatsappNaHora: 1 }), null);
  assertEquals(retomadaAposSemWhatsapp({ proximoDisparoEm: null, agoraMs: AGORA, semWhatsappNaHora: 1 }), null);
  assertEquals(retomadaAposSemWhatsapp({ proximoDisparoEm: "lixo", agoraMs: AGORA, semWhatsappNaHora: 1 }), null);
});

Deno.test("reserva entre 5 e 10 min so encurta quando o sorteio cai antes dela", () => {
  const oitoMin = new Date(AGORA + 8 * 60_000).toISOString();
  assertEquals(
    retomadaAposSemWhatsapp({ proximoDisparoEm: oitoMin, agoraMs: AGORA, semWhatsappNaHora: 1, sorteio: () => 0 }),
    new Date(AGORA + RETOMADA_MIN_S * 1000).toISOString(),
  );
  assertEquals(retomadaAposSemWhatsapp({ proximoDisparoEm: oitoMin, agoraMs: AGORA, semWhatsappNaHora: 1, sorteio: () => 0.9 }), null);
});
