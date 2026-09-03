/**
 * I/O com a Evolution API a partir das Edge Functions.
 *
 * Cliente fino de propósito: monta a chamada, devolve o resultado. Toda decisão — quanto tempo
 * digitar, o que o erro significa, que status o estado vira — está em `evolution.ts`, que é puro
 * e testado. Se você for escrever um `if` de negócio aqui, ele provavelmente pertence lá.
 *
 * A chave e a URL saem da tabela `segredos` (`EVOLUTION_URL`, `EVOLUTION_API_KEY`), lida só pelo
 * service_role — nunca de `Deno.env`, que o runtime do Supabase não deixa setar.
 */

import {
  classificarErroEnvio,
  estadoConexaoParaStatus,
  type ResultadoEnvio,
  type StatusChip,
  tempoDigitacao,
} from "./evolution.ts";

export type ConfigEvolution = { url: string; apiKey: string };

/** Extrai a config da Evolution do mapa de segredos. Devolve null se não estiver configurada. */
export function configEvolution(segredos: Record<string, string>): ConfigEvolution | null {
  const url = String(segredos.EVOLUTION_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = String(segredos.EVOLUTION_API_KEY ?? "").trim();
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

export type RespostaEnvio =
  | { ok: true; messageId: string | null; delayMs: number; bruto: unknown }
  | { ok: false; resultado: ResultadoEnvio; status: number; bruto: unknown };

/**
 * Envia um texto, precedido do tempo de "digitando…" proporcional ao tamanho.
 *
 * O `delay` vai junto no corpo (a Evolution o usa para segurar a presença antes de mandar), mas
 * quem decide o número é `tempoDigitacao` — ver o comentário lá sobre por que não delegamos isso.
 */
export async function enviarTexto(
  cfg: ConfigEvolution,
  instancia: string,
  numeroE164: string,
  texto: string,
  aleatorio: () => number = Math.random,
): Promise<RespostaEnvio> {
  const delayMs = tempoDigitacao(texto, aleatorio);

  let r: Response;
  try {
    r = await fetch(`${cfg.url}/message/sendText/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
      body: JSON.stringify({
        number: numeroE164.replace(/\D/g, ""),
        text: texto,
        delay: delayMs,
        presence: "composing",
        linkPreview: false,
      }),
    });
  } catch (e) {
    // Rede caiu: é indisponibilidade nossa, jamais invalidez do número (§36).
    return { ok: false, resultado: "falha", status: 0, bruto: String(e) };
  }

  const corpo = await lerJson(r);
  if (!r.ok) {
    return { ok: false, resultado: classificarErroEnvio(r.status, corpo), status: r.status, bruto: corpo };
  }

  // A Evolution devolve a chave da mensagem em `key.id`. Sem ela, o espelho no Chatwoot não
  // consegue reconciliar autoria (§37) — então tratamos ausência como envio sem id, não como erro.
  const messageId = (() => {
    const k = (corpo as { key?: { id?: unknown } } | null)?.key?.id;
    return typeof k === "string" && k ? k : null;
  })();

  return { ok: true, messageId, delayMs, bruto: corpo };
}

export type EstadoInstancia = {
  estado: string;
  status: StatusChip;
  bruto: unknown;
};

/** Estado da conexão de uma instância, já traduzido para o `status_chip` do nosso banco. */
export async function estadoInstancia(
  cfg: ConfigEvolution,
  instancia: string,
): Promise<EstadoInstancia> {
  let r: Response;
  try {
    r = await fetch(`${cfg.url}/instance/connectionState/${encodeURIComponent(instancia)}`, {
      headers: { apikey: cfg.apiKey },
    });
  } catch (e) {
    return { estado: "erro", status: "desconectado", bruto: String(e) };
  }

  const corpo = await lerJson(r);

  // 401 na própria consulta = sessão revogada.
  if (r.status === 401) return { estado: "close", status: "banido", bruto: corpo };

  const estado = String(
    (corpo as { instance?: { state?: unknown }; state?: unknown } | null)?.instance?.state ??
      (corpo as { state?: unknown } | null)?.state ??
      "",
  );
  const codigo = (corpo as { statusCode?: unknown } | null)?.statusCode;

  return {
    estado,
    status: estadoConexaoParaStatus(estado, typeof codigo === "number" ? codigo : undefined),
    bruto: corpo,
  };
}

// ── Registro completo das instâncias (o que `connectionState` não conta) ──────────────────

export type InstanciaEvolution = {
  nome: string;
  estado: string;                     // open | connecting | close
  codigoDesconexao: number | null;
  motivoDesconexao: string | null;    // ex.: "conflict/device_removed"
  desconectadoEm: string | null;
};

/**
 * Extrai o motivo legível de `disconnectionObject`, que a Evolution guarda como STRING de JSON.
 *
 * O corpo real de uma sessão revogada é:
 * `{"error":{"data":{"tag":"conflict","attrs":{"type":"device_removed"}},"output":{"statusCode":401,...}}}`
 *
 * A distinção importa e custou uma manhã em 03/09/2026: `401` sozinho parece ban, mas
 * `conflict/device_removed` é o aparelho vinculado sendo REMOVIDO da conta — recuperável com
 * logout + QR novo. Ban de verdade não tem essa assinatura.
 */
export function motivoDaDesconexao(bruto: unknown): string | null {
  if (typeof bruto !== "string" || !bruto.trim()) return null;
  try {
    const o = JSON.parse(bruto) as Record<string, any>;
    const dados = o?.error?.data;
    const partes = [dados?.tag, dados?.attrs?.type].filter((p) => typeof p === "string" && p);
    if (partes.length) return partes.join("/");
    const msg = o?.error?.output?.payload?.message;
    return typeof msg === "string" && msg ? msg : null;
  } catch {
    return null;
  }
}

/**
 * Lê TODAS as instâncias de uma vez.
 *
 * Uma chamada só para todos os chips: o monitor roda a cada 15 min e não faz sentido bater N vezes
 * na Evolution. Devolve `null` quando a consulta falha — o chamador não pode confundir
 * "Evolution fora do ar" com "chip caído" e derrubar todo mundo por engano.
 */
export async function instanciasEvolution(
  cfg: ConfigEvolution,
): Promise<Map<string, InstanciaEvolution> | null> {
  let r: Response;
  try {
    r = await fetch(`${cfg.url}/instance/fetchInstances`, { headers: { apikey: cfg.apiKey } });
  } catch {
    return null;
  }
  if (!r.ok) return null;
  const corpo = await lerJson(r);
  if (!Array.isArray(corpo)) return null;

  const mapa = new Map<string, InstanciaEvolution>();
  for (const item of corpo) {
    const inst = (item as Record<string, any>)?.instance ?? item;
    const nome = inst?.instanceName ?? inst?.name;
    if (typeof nome !== "string" || !nome) continue;
    const codigo = inst?.disconnectionReasonCode;
    mapa.set(nome, {
      nome,
      estado: String(inst?.connectionStatus ?? inst?.state ?? ""),
      codigoDesconexao: typeof codigo === "number" ? codigo : null,
      motivoDesconexao: motivoDaDesconexao(inst?.disconnectionObject),
      desconectadoEm: typeof inst?.disconnectionAt === "string" ? inst.disconnectionAt : null,
    });
  }
  return mapa;
}
