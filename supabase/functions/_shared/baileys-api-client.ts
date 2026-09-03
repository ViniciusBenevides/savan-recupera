// I/O com o baileys-api (fazer-ai) — o provedor Baileys nativo do Chatwoot self-hosted.
//
// Por que este arquivo existe ao lado de `evolution-client.ts`: em 03/09/2026 o chip 1 ficou
// preso numa sessão revogada na Evolution (401 `conflict/device_removed`), e o WhatsApp passou a
// recusar pareamento novo nesse número por um tempo (§8 do guia do Baileys — tentativas demais em
// pouco tempo). O mesmo número pareou de primeira pelo canal nativo do Chatwoot — outro serviço
// Baileys, exposto publicamente e ligado aqui como segundo provedor. `chips.conector` decide qual
// dos dois um chip usa; a semântica de negócio (ritmo, digitação, opt-in) não muda em nada.
//
// Documentação da API: https://github.com/fazer-ai/baileys-api (README + swagger.json).

import { tempoDigitacao } from "./evolution.ts";

export type ConfigBaileysApi = { url: string; apiKey: string };

export function configBaileysApi(segredos: Record<string, string>): ConfigBaileysApi | null {
  const url = String(segredos.BAILEYS_API_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = String(segredos.BAILEYS_API_KEY ?? "").trim();
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

async function lerJson(r: Response): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

// ── Ambiguidade do 9º dígito brasileiro ─────────────────────────────────────────────────────
//
// Achado em 03/09/2026: a Amanda (devedor 573) tinha `+5564999185731` cadastrado, o envio saiu
// (HTTP 200) mas nunca chegou. Mandando manualmente pelo Chatwoot SEM o 9 extra (`+556499185731`)
// chegou na hora. Causa: `evolution.ts` (`numeroParaJid`) documenta que "quem concilia [o 9º
// dígito] é a Evolution, via mergeBrazilContacts" — mas esse provedor é outro serviço (fazer-ai/
// baileys-api), sem esse recurso e sem endpoint de verificação de número. A reconciliação que
// a Evolution fazia de graça sumiu quando o chip 1 migrou pra cá.

/**
 * Devolve as variantes de E.164 a tentar, na ordem — só quando o número é celular brasileiro e a
 * ambiguidade existe de fato. Fora do Brasil, ou fora do formato DDD + 8/9 dígitos, devolve só o
 * original: nada a tentar, e nenhuma latência extra é adicionada pelo chamador.
 *
 * Quando o telefone está guardado com 9 dígitos locais (o padrão desde o mandato da ANATEL),
 * tenta PRIMEIRO sem o 9 extra — achado com o usuário no caso da Amanda (DDD 64, Goiás):
 * "geralmente" é esse o formato que o WhatsApp resolve de verdade pra conta, e foi o que
 * confirmadamente entregou no teste manual. O formato de 9 dígitos original fica como alternativa,
 * não descartado — a ordem é sobre qual tentar primeiro, a verificação por ack decide de fato.
 */
export function variantesE164Br(e164: string): string[] {
  const digitos = String(e164 ?? "").replace(/\D/g, "");
  if (!digitos.startsWith("55") || (digitos.length !== 12 && digitos.length !== 13)) {
    return [e164];
  }
  const ddd = digitos.slice(2, 4);
  const local = digitos.slice(4);
  const original = `+${digitos}`;
  if (local.length === 9 && local[0] === "9") {
    return [`+55${ddd}${local.slice(1)}`, original];
  }
  if (local.length === 8) {
    return [original, `+55${ddd}9${local}`];
  }
  return [original];
}

/**
 * Espera até `tentativas * intervaloMs` por um ack NOVO (posterior ao momento em que esta função
 * foi chamada) em `/connections/{numeroChip}/health`. `lastOutgoingAckAgoMs` é agregado da
 * CONEXÃO, não da mensagem — funciona como prova per-mensagem só porque este projeto manda uma
 * mensagem de cada vez, bem espaçadas (§8 do guia Baileys: 2/hora por número). Não usar isto sob
 * envio concorrente no mesmo chip.
 */
export async function aguardarAckBaileysApi(
  cfg: ConfigBaileysApi,
  numeroChip: string,
  opts: { tentativas?: number; intervaloMs?: number } = {},
): Promise<boolean> {
  const tentativas = opts.tentativas ?? 4;
  const intervaloMs = opts.intervaloMs ?? 3000;
  const inicio = Date.now();
  for (let i = 0; i < tentativas; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervaloMs));
    const saude = await saudeConexaoBaileysApi(cfg, numeroChip);
    const decorridoMs = Date.now() - inicio;
    // margem de 2s: o relógio do servidor do baileys-api não é o daqui, e a consulta em si leva
    // um instante — sem a margem, um ack genuíno bem no limite do intervalo seria rejeitado.
    if (saude.ok && typeof saude.ultimoAckAgoMs === "number" && saude.ultimoAckAgoMs <= decorridoMs + 2000) {
      return true;
    }
  }
  return false;
}

// ── Envio ────────────────────────────────────────────────────────────────────────────────

export type ResultadoEnvioBaileysApi = "chip_caido" | "retentar" | "falha";

export type RespostaEnvioBaileysApi =
  | { ok: true; messageId: string | null; delayMs: number }
  | { ok: false; resultado: ResultadoEnvioBaileysApi; status: number; detalhe: string | null };

/**
 * Traduz o HTTP da API para o vocabulário deste projeto.
 *
 * A doc oficial é explícita sobre dois pontos que decidem esta função:
 *
 * - `404` = "Phone number not connected" — a sessão do chip caiu. É o `chip_caido` de verdade.
 * - `503` = circuit breaker aberto ou mutex de keystore travado — a doc AVISA: "the connection is
 *   up and must NOT be marked down". Marcar o chip como caído aqui seria o erro do §36 de novo
 *   (indisponibilidade lida como invalidez), só que na direção do chip em vez do telefone.
 *
 * `409` e `504` têm resultado INDETERMINADO (a mensagem pode ter saído mesmo sem confirmação) —
 * por isso caem em `falha` com um erro próprio, nunca em algo que o `campanha-registrar` devolva
 * à fila sozinho. Reenviar um envio indeterminado é mandar a abordagem duas vezes pra mesma
 * pessoa, e isso é padrão de robô (§31).
 */
export function classificarErroEnvioBaileysApi(status: number): ResultadoEnvioBaileysApi {
  if (status === 404) return "chip_caido";
  if (status === 503) return "retentar";
  if (status === 421) return "retentar"; // topologia de cluster; não usamos, mas é seguro tratar como transitório
  return "falha";
}

/**
 * Manda texto: presença "digitando…" primeiro, depois `send-message`.
 *
 * Diferente da Evolution, aqui presença e envio são DUAS chamadas — este provedor não aceita
 * `delay`/`presence` embutido no `send-message`. A presença é best-effort de propósito (nunca
 * derruba o envio se falhar): o que importa de verdade pro ADR-0002 é a mensagem sair parecendo
 * humana, não que a simulação de digitação seja perfeita.
 *
 * `messageId` é gerado aqui e mandado no corpo — é o mecanismo de idempotência que a doc do
 * baileys-api recomenda: um `504` (timeout, resultado indeterminado) com id reservado pode ser
 * reenviado com segurança, porque o WhatsApp deduplica pelo id. Sem isso a API responde `409
 * indeterminate` e a mensagem fica em limbo. Ainda tratamos isso como `falha` aqui (v1 não faz o
 * retry automático), mas o id já viaja pronto pra quando fizer.
 *
 * `numeroChip` é o número DO CHIP (path param, com `+`); `jidDestino` já vem convertido pelo
 * chamador (ver `numeroParaJid` em `evolution.ts`).
 */
export async function enviarTextoBaileysApi(
  cfg: ConfigBaileysApi,
  numeroChip: string,
  jidDestino: string,
  texto: string,
  aleatorio: () => number = Math.random,
): Promise<RespostaEnvioBaileysApi> {
  const delayMs = tempoDigitacao(texto, aleatorio);
  const instancia = encodeURIComponent(numeroChip);

  try {
    await fetch(`${cfg.url}/connections/${instancia}/presence`, {
      method: "PATCH",
      headers: { "x-api-key": cfg.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "composing", toJid: jidDestino }),
    });
  } catch {
    // best-effort — presença não pode barrar o envio
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));

  let r: Response;
  try {
    r = await fetch(`${cfg.url}/connections/${instancia}/send-message`, {
      method: "POST",
      headers: { "x-api-key": cfg.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        jid: jidDestino,
        messageContent: { text: texto },
        messageId: crypto.randomUUID(),
      }),
    });
  } catch (e) {
    return { ok: false, resultado: "falha", status: 0, detalhe: String(e) };
  }

  if (r.ok) {
    const corpo = await lerJson(r) as { data?: { key?: { id?: unknown } } } | null;
    const id = corpo?.data?.key?.id;
    return { ok: true, messageId: typeof id === "string" ? id : null, delayMs };
  }

  const corpo = await lerJson(r);
  const detalhe = typeof corpo === "string" ? corpo : JSON.stringify(corpo ?? "").slice(0, 300);
  return { ok: false, resultado: classificarErroEnvioBaileysApi(r.status), status: r.status, detalhe };
}

// ── Estado da conexão ───────────────────────────────────────────────────────────────────

export type SaudeConexaoBaileysApi = {
  ok: boolean;                 // a consulta em si funcionou (não confundir com `connected`)
  connected: boolean | null;
  sendState: string | null;
  consecutivosTimeout: number | null;
  // `lastOutgoingAckAgoMs` é, segundo a doc oficial, "the only end-to-end proof that sending
  // works" — a confirmação que o WhatsApp manda pra uma mensagem NOSSA. `connected: true` só
  // prova que o socket está de pé; não prova que o que sai está chegando (§8 do guia Baileys:
  // "numa conta já restrita, o WhatsApp aceita e descarta em silêncio"). Ver `chips-monitor`.
  ultimoAckAgoMs: number | null;
  ultimoEnvioCompletoAgoMs: number | null;
  bruto: unknown;
};

/**
 * `GET /connections/{phoneNumber}/health`. Devolve `ok: false` só quando a CONSULTA falha — a
 * mesma disciplina do `evolution-client.ts`: indisponibilidade da API não pode ser confundida com
 * "todos os chips caíram" (§36). `connected: false` é o dado de verdade sobre o chip; erro de rede
 * na consulta é outra coisa e não deve derrubar ninguém.
 */
export async function saudeConexaoBaileysApi(
  cfg: ConfigBaileysApi,
  numeroChip: string,
): Promise<SaudeConexaoBaileysApi> {
  let r: Response;
  try {
    r = await fetch(`${cfg.url}/connections/${encodeURIComponent(numeroChip)}/health`, {
      headers: { "x-api-key": cfg.apiKey },
    });
  } catch (e) {
    return {
      ok: false, connected: null, sendState: null, consecutivosTimeout: null,
      ultimoAckAgoMs: null, ultimoEnvioCompletoAgoMs: null, bruto: String(e),
    };
  }

  // 404 aqui É dado válido: "esta conexão não existe" — não é falha da consulta.
  if (r.status === 404) {
    return {
      ok: true, connected: false, sendState: null, consecutivosTimeout: null,
      ultimoAckAgoMs: null, ultimoEnvioCompletoAgoMs: null, bruto: null,
    };
  }
  if (!r.ok) {
    return {
      ok: false, connected: null, sendState: null, consecutivosTimeout: null,
      ultimoAckAgoMs: null, ultimoEnvioCompletoAgoMs: null, bruto: await lerJson(r),
    };
  }

  const corpo = await lerJson(r) as {
    data?: {
      connected?: unknown; sendState?: unknown; consecutiveSendTimeouts?: unknown;
      lastOutgoingAckAgoMs?: unknown; lastSendCompletedAgoMs?: unknown;
    };
  } | null;
  const d = corpo?.data ?? {};
  return {
    ok: true,
    connected: typeof d.connected === "boolean" ? d.connected : null,
    sendState: typeof d.sendState === "string" ? d.sendState : null,
    consecutivosTimeout: typeof d.consecutiveSendTimeouts === "number" ? d.consecutiveSendTimeouts : null,
    ultimoAckAgoMs: typeof d.lastOutgoingAckAgoMs === "number" ? d.lastOutgoingAckAgoMs : null,
    ultimoEnvioCompletoAgoMs: typeof d.lastSendCompletedAgoMs === "number" ? d.lastSendCompletedAgoMs : null,
    bruto: corpo,
  };
}
