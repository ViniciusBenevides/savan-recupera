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
import { type BloqueioWhatsapp, lerBloqueioWhatsapp } from "./bloqueio-whatsapp.ts";

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

// ── Qual forma do número o WhatsApp conhece ─────────────────────────────────────────────
//
// Resolve a ambiguidade do 9º dígito PERGUNTANDO, em vez de adivinhar pela ordem de
// `variantesE164Br`. Uma chamada ao `on-whatsapp` com as duas variantes de uma vez: o WhatsApp
// devolve só o JID canônico da conta (as duas perguntas colapsam numa resposta) e omite o que
// não existe. Conferido ao vivo em 18/09/2026: `+5562982624557` e `+556282624557` voltaram como
// uma entrada só, `556282624557@s.whatsapp.net`, `exists: true` — a forma SEM o 9, a mesma que
// a medição de 09/09 apontou como a única que entrega.
//
// Isto NÃO é a sondagem que o Q17 removeu: aquela varria a base; esta é UMA consulta por
// telefone, só na hora da primeira mensagem, no ritmo da abordagem — o mesmo que o app do
// WhatsApp faz quando alguém digita um número novo. O resultado fica gravado em
// `telefones_devedor` e o número nunca mais é perguntado.

export type ConsultaNumeroWhatsapp =
  | { status: "existe"; e164: string }
  | { status: "nao_existe" }
  | { status: "indeterminado"; detalhe: string };

/** As variantes a perguntar, já como JID. Fora do padrão brasileiro, só o próprio número. */
export function jidsParaConsulta(e164: string): string[] {
  return [...new Set(variantesE164Br(e164).map((v) => `${String(v).replace(/\D/g, "")}@s.whatsapp.net`))];
}

/**
 * Lê a resposta do `on-whatsapp`. Falha FECHADA para "não existe" (lição do §36: um `HTTP 200`
 * com corpo `null` já virou "número inexistente" e descartou fila boa):
 *
 * - "existe" só com uma entrada `exists: true` e JID legível;
 * - "nao_existe" só com HTTP 200 e uma LISTA de verdade sem nenhuma entrada existente — o
 *   provedor (Baileys `onWhatsApp`) omite quem não tem WhatsApp;
 * - qualquer outra coisa (corpo nulo, formato inesperado, erro HTTP) é "indeterminado", e quem
 *   chama segue como antes, sem gravar nada.
 */
export function interpretarOnWhatsapp(
  httpStatus: number,
  corpo: unknown,
  e164Original: string,
): ConsultaNumeroWhatsapp {
  if (httpStatus !== 200) return { status: "indeterminado", detalhe: `http_${httpStatus}` };
  const lista = Array.isArray(corpo)
    ? corpo
    : Array.isArray((corpo as { data?: unknown } | null)?.data)
    ? (corpo as { data: unknown[] }).data
    : null;
  if (!lista) return { status: "indeterminado", detalhe: "corpo_sem_lista" };

  const existentes = lista
    .filter((x) => (x as { exists?: unknown })?.exists === true)
    .map((x) => String((x as { jid?: unknown }).jid ?? ""))
    .filter((jid) => jid.endsWith("@s.whatsapp.net"))
    .map((jid) => jid.split("@")[0].split(":")[0].replace(/\D/g, ""))
    .filter(Boolean);

  if (existentes.length) {
    // Duas contas distintas (com e sem o 9 sendo pessoas diferentes) é raro, mas possível: aí
    // vale o número exatamente como foi cadastrado, se ele for um dos dois.
    const original = String(e164Original).replace(/\D/g, "");
    const escolhido = existentes.includes(original) ? original : existentes[0];
    return { status: "existe", e164: `+${escolhido}` };
  }
  if (lista.every((x) => (x as { exists?: unknown })?.exists !== true)) return { status: "nao_existe" };
  return { status: "indeterminado", detalhe: "existe_sem_jid_legivel" };
}

/** `POST /connections/{chip}/on-whatsapp` com as variantes do número. Uma chamada, um USync. */
export async function consultarNumeroBaileysApi(
  cfg: ConfigBaileysApi,
  numeroChip: string,
  e164: string,
): Promise<ConsultaNumeroWhatsapp> {
  let r: Response;
  try {
    r = await fetch(`${cfg.url}/connections/${encodeURIComponent(numeroChip)}/on-whatsapp`, {
      method: "POST",
      headers: { "x-api-key": cfg.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ jids: jidsParaConsulta(e164) }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return { status: "indeterminado", detalhe: `rede: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200) };
  }
  return interpretarOnWhatsapp(r.status, await lerJson(r), e164);
}

/**
 * Espera até `tentativas * intervaloMs` por um ack NOVO (posterior ao momento em que esta função
 * foi chamada) em `/connections/{numeroChip}/health`.
 *
 * ⚠️ NÃO use isto para decidir se UMA mensagem específica chegou. `lastOutgoingAckAgoMs` é agregado
 * da CONEXÃO, não da mensagem, e a suposição de que "uma mensagem por vez" o torna per-mensagem é
 * falsa assim que o mesmo pedido manda dois envios seguidos: o ack atrasado do primeiro chega
 * dentro da janela de espera do segundo e é creditado a ele. Foi assim que o `enviar-mensagem`
 * concluiu que a variante errada do 9º dígito era a boa e sobrescreveu seis telefones válidos com
 * números que nunca entregaram (09/09/2026). Prova por mensagem é o recibo: `mensagens.status_entrega`,
 * gravado pelo `chatwoot-sync` a partir do `message_updated`.
 *
 * Serve para o que o nome diz: perguntar se a CONEXÃO deu sinal de vida recentemente — é o uso do
 * `chips-monitor` e do `sem_ack_confirmado`.
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

/**
 * Envia áudio como **nota de voz** (a bolinha com a onda, não um anexo de arquivo).
 *
 * O `send-message` do baileys-api aceita `messageContent` em seis formatos (swagger: `text`,
 * `image`, `video`, `document`, `audio`, `react`); a variante de áudio é
 * `{ audio, ptt, mimetype, quotedMessage }`, com `audio` em base64. É o mesmo caminho que o
 * Chatwoot usa quando alguém grava pelo botão de microfone no atendimento — só que aqui saímos
 * direto no provedor, que é o que o ADR-0002 exige: presença e atraso por mensagem são a defesa
 * comportamental do canal não-oficial, e mandar pelo Chatwoot abre mão dela.
 *
 * `ptt: true` é o que faz virar nota de voz. Sem ele o WhatsApp mostra um anexo de áudio.
 *
 * A presença aqui é `recording` ("gravando áudio…"), não `composing` — o enum do provedor tem as
 * duas, e usar a errada denuncia o robô tanto quanto não usar nenhuma.
 *
 * ⚠️ **Não testado contra provedor no ar.** O formato veio do swagger do baileys-api e do
 * `whatsapp_baileys_service.rb` do fork do Chatwoot. O ponto incerto é o container: mandamos OGG/Opus
 * (`audio/ogg; codecs=opus`), que é o container nativo de nota de voz do WhatsApp. Testado em
 * 10/09/2026: HTTP 200 e `delivered`. Testar com número de teste antes de encostar em devedor.
 */
export async function enviarAudioBaileysApi(
  cfg: ConfigBaileysApi,
  numeroChip: string,
  jidDestino: string,
  audioBase64: string,
  opts: { textoOriginal?: string; mimetype?: string; aleatorio?: () => number } = {},
): Promise<RespostaEnvioBaileysApi> {
  // O tempo de "gravando" é proporcional ao texto que gerou o áudio — falar a ~150 palavras por
  // minuto dá quase o mesmo número que digitar, então a fórmula de digitação serve de estimativa.
  const delayMs = tempoDigitacao(opts.textoOriginal ?? "", opts.aleatorio ?? Math.random);
  const instancia = encodeURIComponent(numeroChip);

  try {
    await fetch(`${cfg.url}/connections/${instancia}/presence`, {
      method: "PATCH",
      headers: { "x-api-key": cfg.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "recording", toJid: jidDestino }),
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
        messageContent: {
          audio: audioBase64,
          ptt: true,
          mimetype: opts.mimetype ?? "audio/ogg; codecs=opus",
        },
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

// ── Bloqueio de alcance (reach-out time-lock) ───────────────────────────────────────────

export type ConsultaBloqueioBaileysApi = {
  ok: boolean;                 // a consulta em si funcionou
  connected: boolean | null;   // 404 = número não conectado (dado, não falha)
  bloqueio: BloqueioWhatsapp | null;
};

/**
 * `GET /connections/{phoneNumber}/reachout-timelock` — o estado que o WhatsApp dá, na hora, sobre
 * o bloqueio de iniciar conversa nova (o motivo do erro 463). Ver `bloqueio-whatsapp.ts`.
 *
 * Pode ser chamado num número restrito sem piorar nada: a própria doc do baileys-api diz que é
 * uma consulta MEX só de leitura, sem mensagem nenhuma. Efeito colateral útil: o provedor repassa
 * o resultado ao Chatwoot, então a cópia em `provider_connection.reachout_time_lock` fica em dia.
 *
 * Só responde com o número CONECTADO — caído, o estado conhecido é o da cópia do Chatwoot.
 */
export async function consultarBloqueioBaileysApi(
  cfg: ConfigBaileysApi,
  numeroChip: string,
): Promise<ConsultaBloqueioBaileysApi> {
  let r: Response;
  try {
    r = await fetch(`${cfg.url}/connections/${encodeURIComponent(numeroChip)}/reachout-timelock`, {
      headers: { "x-api-key": cfg.apiKey },
    });
  } catch {
    return { ok: false, connected: null, bloqueio: null };
  }
  if (r.status === 404) {
    await r.body?.cancel();
    return { ok: true, connected: false, bloqueio: null };
  }
  if (!r.ok) {
    await r.body?.cancel();
    return { ok: false, connected: null, bloqueio: null };
  }
  const corpo = await lerJson(r) as { data?: unknown } | null;
  const bloqueio = lerBloqueioWhatsapp(corpo?.data);
  // Resposta 200 sem estado legível: a consulta não disse nada — não inventar "sem bloqueio".
  return { ok: bloqueio !== null, connected: true, bloqueio };
}
