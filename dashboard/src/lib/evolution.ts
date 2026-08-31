// I/O com a Evolution API a partir do painel: provisionar número, ler QR, ver estado e ligar o
// Chatwoot. O envio de mensagem NÃO passa por aqui — ele vive na Edge Function `enviar-mensagem`,
// que é quem aplica o ritmo de digitação.
//
// A credencial vem do ambiente do painel (EVOLUTION_URL / EVOLUTION_API_KEY), no mesmo padrão do
// `chatwoot.ts`. A sessão do WhatsApp (chaves Signal) nunca passa por aqui nem pelo nosso banco:
// ela vive no Postgres da própria Evolution — ver §2 do guia do Baileys.

export type ResultadoEvolution<T> =
  | ({ ok: true } & T)
  | { ok: false; motivo: "sem_config" | "falha"; mensagem: string };

function cfg() {
  return {
    url: process.env.EVOLUTION_URL?.trim().replace(/\/+$/, ""),
    apiKey: process.env.EVOLUTION_API_KEY?.trim(),
  };
}

async function lerJson(r: Response): Promise<any | null> {
  try { return await r.json(); } catch { return null; }
}

const semConfig = { ok: false as const, motivo: "sem_config" as const, mensagem: "Evolution não configurada no painel (EVOLUTION_URL/EVOLUTION_API_KEY)." };

/**
 * Extrai do corpo da Evolution a IMAGEM do QR, e só ela.
 *
 * A Evolution devolve dois campos parecidos e bem diferentes: `base64` é a imagem pronta e `code` é
 * o texto cru do QR — que o navegador não sabe desenhar. Aceitar `code` como se fosse imagem produz
 * um `<img>` quebrado na tela de conexão, que é justamente a tela em que o dono está de celular na
 * mão. Sem imagem devolvemos `null` e a tela cai no código de pareamento.
 */
function imagemQr(fonte: any): string | null {
  const b64 = typeof fonte?.base64 === "string" ? fonte.base64.trim() : "";
  if (!b64) return null;
  return b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
}

/**
 * Cria a instância que representa um chip e devolve o QR para vincular o número.
 *
 * Idempotente na prática: se a instância já existe, a Evolution recusa a criação e nós seguimos
 * direto para o `/instance/connect`, que devolve o QR da instância existente. Isso importa porque
 * o dono vai apertar "conectar" mais de uma vez enquanto o QR expira.
 */
export async function criarInstancia(opts: { instancia: string; numeroE164?: string | null }): Promise<
  ResultadoEvolution<{ qr: string | null; pairing_code: string | null; ja_existia: boolean }>
> {
  const { url, apiKey } = cfg();
  if (!url || !apiKey) return semConfig;

  const H = { "Content-Type": "application/json", apikey: apiKey };
  let jaExistia = false;

  try {
    const r = await fetch(`${url}/instance/create`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        instanceName: opts.instancia,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        // Com o número no corpo a Evolution devolve TAMBÉM um código de pareamento, além do QR.
        // É o plano B de quem não consegue escanear (celular sem câmera livre, tela pequena):
        // digita-se o código no WhatsApp em vez de apontar para o monitor.
        ...(opts.numeroE164 ? { number: opts.numeroE164.replace(/\D/g, "") } : {}),
      }),
    });
    const corpo = await lerJson(r);

    if (!r.ok) {
      // 403/409 com "already in use" = a instância já existe. Não é erro do ponto de vista do dono.
      const txt = JSON.stringify(corpo ?? "").toLowerCase();
      if (txt.includes("already in use") || txt.includes("already exists") || r.status === 409) {
        jaExistia = true;
      } else {
        return { ok: false, motivo: "falha", mensagem: `Evolution recusou criar a instância (HTTP ${r.status}).` };
      }
    } else {
      const qr = imagemQr(corpo?.qrcode);
      if (qr) {
        return { ok: true, qr, pairing_code: corpo?.qrcode?.pairingCode ?? null, ja_existia: false };
      }
    }
  } catch {
    return { ok: false, motivo: "falha", mensagem: "Não consegui falar com a Evolution." };
  }

  // Instância já existia, ou nasceu sem QR no corpo: pede o QR pelo connect.
  const c = await conectarInstancia(opts.instancia);
  if (!c.ok) return c;
  return { ok: true, qr: c.qr, pairing_code: c.pairing_code, ja_existia: jaExistia };
}

/** Pede um QR novo (ou o código de pareamento) para uma instância que já existe. */
export async function conectarInstancia(instancia: string): Promise<
  ResultadoEvolution<{ qr: string | null; pairing_code: string | null }>
> {
  const { url, apiKey } = cfg();
  if (!url || !apiKey) return semConfig;

  try {
    const r = await fetch(`${url}/instance/connect/${encodeURIComponent(instancia)}`, {
      headers: { apikey: apiKey },
    });
    const corpo = await lerJson(r);
    if (!r.ok) {
      return { ok: false, motivo: "falha", mensagem: `Evolution não devolveu o QR (HTTP ${r.status}).` };
    }
    return {
      ok: true,
      qr: imagemQr(corpo),
      pairing_code: corpo?.pairingCode ?? null,
    };
  } catch {
    return { ok: false, motivo: "falha", mensagem: "Não consegui falar com a Evolution." };
  }
}

/** Estado bruto da conexão. A tradução para `status_chip` é feita no lado Deno, em `evolution.ts`. */
export async function estadoInstancia(instancia: string): Promise<
  ResultadoEvolution<{ estado: string; codigo?: number }>
> {
  const { url, apiKey } = cfg();
  if (!url || !apiKey) return semConfig;

  try {
    const r = await fetch(`${url}/instance/connectionState/${encodeURIComponent(instancia)}`, {
      headers: { apikey: apiKey },
    });
    const corpo = await lerJson(r);
    // HTTP 401/403 aqui é a EVOLUTION recusando a NOSSA chave, não o WhatsApp derrubando o número.
    // Confundir os dois é caro: a chave errada marcaria todo chip como 'banido', que é terminal e
    // manda comprar outro número. Falha fechada, como em `classificarErroEnvio` (§36). O 401 que
    // significa sessão revogada vem no CORPO, em `statusCode`, e é lido logo abaixo.
    if (r.status === 401 || r.status === 403) {
      return {
        ok: false, motivo: "sem_config",
        mensagem: "A Evolution recusou a credencial do painel. Confira EVOLUTION_API_KEY — isto não é queda do número.",
      };
    }
    // 404 = a instância não existe (nunca foi criada, ou foi apagada na Evolution). Não é falha de
    // comunicação: é um chip que precisa ser provisionado de novo. Quem trata isso é a tela, que
    // oferece o botão de conectar — devolver erro aqui a deixaria só com um 502 sem saída.
    if (r.status === 404) return { ok: true, estado: "nao_existe" };
    if (!r.ok) return { ok: false, motivo: "falha", mensagem: `HTTP ${r.status} ao ler o estado.` };
    return {
      ok: true,
      estado: String(corpo?.instance?.state ?? corpo?.state ?? ""),
      codigo: typeof corpo?.statusCode === "number" ? corpo.statusCode : undefined,
    };
  } catch {
    return { ok: false, motivo: "falha", mensagem: "Não consegui falar com a Evolution." };
  }
}

/**
 * Liga a instância ao Chatwoot. A Evolution cria a inbox e passa a espelhar as conversas nela.
 *
 * `mergeBrazilContacts` é obrigatório aqui: sem ele, o mesmo devedor vira dois contatos (com e sem
 * o 9º dígito) e o dossiê racha — que é exatamente o que o ADR-0001 existe para evitar.
 */
export async function ligarChatwoot(opts: {
  instancia: string; nomeInbox: string;
}): Promise<ResultadoEvolution<{ configurado: true }>> {
  const { url, apiKey } = cfg();
  if (!url || !apiKey) return semConfig;

  const cwUrl = process.env.CHATWOOT_URL?.trim();
  const cwToken = process.env.CHATWOOT_TOKEN?.trim();
  const cwAccount = process.env.CHATWOOT_ACCOUNT_ID?.trim() || "1";
  if (!cwUrl || !cwToken) {
    return { ok: false, motivo: "sem_config", mensagem: "Chatwoot não configurado (CHATWOOT_URL/CHATWOOT_TOKEN)." };
  }

  try {
    const r = await fetch(`${url}/chatwoot/set/${encodeURIComponent(opts.instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({
        enabled: true,
        accountId: cwAccount,
        token: cwToken,
        url: cwUrl,
        nameInbox: opts.nomeInbox,
        signMsg: false,          // o robô não assina: quem fala é a persona, não um atendente
        reopenConversation: true, // a conversa é do devedor — reabrir, não criar outra (ADR-0001)
        conversationPending: false,
        importContacts: false,   // a base de contatos é nossa, não do aparelho
        importMessages: false,
        mergeBrazilContacts: true,
      }),
    });
    if (!r.ok) {
      return { ok: false, motivo: "falha", mensagem: `Evolution recusou ligar o Chatwoot (HTTP ${r.status}).` };
    }
    return { ok: true, configurado: true };
  } catch {
    return { ok: false, motivo: "falha", mensagem: "Não consegui falar com a Evolution." };
  }
}
