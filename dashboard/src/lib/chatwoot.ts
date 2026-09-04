import { supabaseAdmin } from "@/lib/supabase-server";

export type ResultadoChatwoot =
  | { ok: true; inbox_id: number; ja_existia?: boolean }
  | { ok: false; motivo: "sem_config" | "falha"; mensagem: string };

function cfgCw() {
  return {
    url: process.env.CHATWOOT_URL?.trim(),
    token: process.env.CHATWOOT_TOKEN?.trim(),
    accountId: process.env.CHATWOOT_ACCOUNT_ID?.trim() || "1",
  };
}

// Cria o inbox WhatsApp **Cloud API (Meta oficial)** no Chatwoot e grava o id no chip.
// provider "whatsapp_cloud", provider_config = { api_key (token permanente), phone_number_id,
// business_account_id (WABA) }. O número real já é conhecido no cadastro (a Meta o devolve) →
// usamos o phone_number real direto, sem placeholder e sem ritual de conexão.
// Devolve também a URL de callback + verify token que o dono cola no app da Meta (etapa única).
export async function criarInboxMeta(opts: {
  chipId: number; nome: string; phoneNumber: string; apiKey: string; phoneNumberId: string; wabaId: string;
}): Promise<ResultadoChatwoot & { callback_url?: string; verify_token?: string }> {
  const { url, token: cwTok, accountId } = cfgCw();
  if (!url || !cwTok) return { ok: false, motivo: "sem_config", mensagem: "Chatwoot não configurado no painel (CHATWOOT_URL/CHATWOOT_TOKEN)." };
  const appName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Recupera";
  try {
    const r = await fetch(`${url}/api/v1/accounts/${accountId}/inboxes`, {
      method: "POST",
      headers: { api_access_token: cwTok, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${appName} ${opts.nome}`,
        channel: {
          type: "whatsapp",
          provider: "whatsapp_cloud",
          phone_number: opts.phoneNumber,
          provider_config: {
            api_key: opts.apiKey,
            phone_number_id: opts.phoneNumberId,
            business_account_id: opts.wabaId,
          },
        },
      }),
    });
    const corpo = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = corpo?.message || corpo?.error ||
        (Array.isArray(corpo?.errors) ? corpo.errors.join(", ") : null) || `Chatwoot respondeu ${r.status}.`;
      return { ok: false, motivo: "falha", mensagem: String(msg) };
    }
    const inboxId: number | null = corpo?.id ?? corpo?.payload?.id ?? null;
    if (!inboxId) return { ok: false, motivo: "falha", mensagem: "Chatwoot não retornou o id do inbox." };
    // o verify token é gerado pelo Chatwoot por inbox cloud; vem no provider_config do retorno.
    const verifyToken: string | undefined =
      corpo?.provider_config?.webhook_verify_token ?? corpo?.payload?.provider_config?.webhook_verify_token ?? undefined;
    await supabaseAdmin().from("chips").update({ chatwoot_inbox_id: inboxId }).eq("id", opts.chipId);
    const callbackUrl = `${url.replace(/\/$/, "")}/webhooks/whatsapp/${opts.phoneNumber}`;
    return { ok: true, inbox_id: inboxId, callback_url: callbackUrl, verify_token: verifyToken };
  } catch (e) {
    return { ok: false, motivo: "falha", mensagem: String(e) };
  }
}

// Relê do inbox cloud a URL de callback + o verify token que a Meta precisa conhecer.
// Usado para (re)configurar o webhook de um chip já cadastrado, quando esses dados não foram
// guardados no cadastro — o verify token é gerado pelo Chatwoot e só ele sabe qual é.
export async function dadosWebhookInbox(inboxId: number): Promise<{ callback_url: string; verify_token: string | null } | null> {
  const { url, token, accountId } = cfgCw();
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/api/v1/accounts/${accountId}/inboxes/${inboxId}`, {
      headers: { api_access_token: token },
    });
    if (!r.ok) return null;
    const corpo = await r.json().catch(() => null);
    const inbox = corpo?.payload ?? corpo;
    const phone: string | undefined = inbox?.phone_number;
    if (!phone) return null;
    return {
      callback_url: `${url.replace(/\/$/, "")}/webhooks/whatsapp/${phone}`,
      verify_token: inbox?.provider_config?.webhook_verify_token ?? null,
    };
  } catch { return null; }
}

// Regrava a configuracao atual do canal depois que a Meta confirmou o webhook. O Chatwoot marca
// o inbox para reautorizacao quando a configuracao automatica inicial falha; configurar o webhook
// por fora resolve a causa, mas a marca fica no Redis ate uma atualizacao valida do canal.
export async function confirmarAutorizacaoInboxMeta(inboxId: number): Promise<boolean> {
  const { url, token, accountId } = cfgCw();
  if (!url || !token) return false;
  try {
    const endpoint = `${url}/api/v1/accounts/${accountId}/inboxes/${inboxId}`;
    const atual = await fetch(endpoint, { headers: { api_access_token: token } });
    if (!atual.ok) return false;
    const corpo = await atual.json().catch(() => null);
    const inbox = corpo?.payload ?? corpo;
    const providerConfig = inbox?.provider_config;
    if (inbox?.provider !== "whatsapp_cloud" || !providerConfig?.api_key || !providerConfig?.phone_number_id) return false;

    const r = await fetch(endpoint, {
      method: "PUT",
      headers: { api_access_token: token, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: { provider_config: providerConfig } }),
    });
    return r.ok;
  } catch { return false; }
}

export async function deletarInbox(inboxId: number): Promise<boolean> {
  const { url, token, accountId } = cfgCw();
  if (!url || !token) return false;
  try {
    const r = await fetch(`${url}/api/v1/accounts/${accountId}/inboxes/${inboxId}`, {
      method: "DELETE", headers: { api_access_token: token },
    });
    return r.ok;
  } catch { return false; }
}

/**
 * Acha, pelo nome, o inbox que a Evolution criou no Chatwoot.
 *
 * A Evolution cria o inbox sozinha durante o `POST /chatwoot/set` e **não devolve o id** — procurar
 * pelo `nameInbox` que mandamos é o único caminho. Esse id não é detalhe: sem ele o chip é mudo.
 * O `campanha-lote` monta o item da fila com `inbox_id` nulo, o `contato-criar` recusa com
 * `inbox_nao_vinculada_a_chip` e o `bot-turno` não consegue voltar do inbox para o chip quando a
 * resposta chega — ou seja, o número conecta e mesmo assim ninguém fala com ninguém.
 */
export async function buscarInboxPorNome(nome: string): Promise<number | null> {
  const { url, token, accountId } = cfgCw();
  if (!url || !token) return null;
  const alvo = nome.trim();
  if (!alvo) return null;
  try {
    const r = await fetch(`${url}/api/v1/accounts/${accountId}/inboxes`, {
      headers: { api_access_token: token }, cache: "no-store",
    });
    if (!r.ok) return null;
    const corpo = await r.json().catch(() => null);
    const lista: any[] = Array.isArray(corpo?.payload) ? corpo.payload : Array.isArray(corpo) ? corpo : [];
    const inbox = lista.find((i) => String(i?.name ?? "").trim() === alvo);
    return typeof inbox?.id === "number" ? inbox.id : null;
  } catch { return null; }
}

/**
 * Nome atual de um inbox, pelo id.
 *
 * Serve para reconectar um chip sem trocar de inbox. O `chatwoot/set` da Evolution identifica o
 * inbox pelo `nameInbox`: se o chip foi renomeado depois de conectado, mandar o nome novo faria a
 * Evolution criar um inbox SEGUNDO e espelhar as conversas lá, enquanto o nosso banco continua
 * apontando para o primeiro — o bot ficaria surdo sem nenhum erro aparecer.
 */
export async function nomeDoInbox(inboxId: number): Promise<string | null> {
  const { url, token, accountId } = cfgCw();
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/api/v1/accounts/${accountId}/inboxes/${inboxId}`, {
      headers: { api_access_token: token }, cache: "no-store",
    });
    if (!r.ok) return null;
    const corpo = await r.json().catch(() => null);
    const nome = (corpo?.payload ?? corpo)?.name;
    return typeof nome === "string" && nome.trim() ? nome : null;
  } catch { return null; }
}

// ── Canal WhatsApp nativo do Chatwoot (provider `baileys`) ──────────────────────────────────
//
// O outro transporte Baileys do projeto (`chips.conector = 'baileys_chatwoot'`), que fala com o
// baileys-api (fazer-ai). A diferença de arquitetura em relação à Evolution decide tudo o que vem
// abaixo: lá o inbox é um `Channel::Api` que a Evolution cria sozinha durante o `chatwoot/set` e
// quem pareia é a Evolution; aqui o inbox é um `Channel::Whatsapp` de provider `baileys` e **quem
// pareia é o próprio Chatwoot** — ele abre a conexão no baileys-api e recebe o QR pelo webhook.
// O painel nunca chama o baileys-api para conectar um número: chama o Chatwoot.
//
// São três passos, nesta ordem:
//   1. `POST /inboxes`                             cria o canal (o Chatwoot valida a credencial do
//                                                  baileys-api sozinho, via `BAILEYS_PROVIDER_*`);
//   2. `POST /inboxes/{id}/setup_channel_provider` manda abrir a conexão — é o que gera o QR;
//   3. `GET  /inboxes/{id}`                        lê `provider_connection`: `connection` e
//                                                  `qr_data_url` (a imagem do QR já em data URL).
//
// Enquanto ninguém escaneia, o baileys-api empurra um QR novo pelo webhook e o Chatwoot atualiza o
// `qr_data_url` sozinho. Por isso a tela deste canal só repete o passo 3: repetir o passo 2 mataria
// a conexão em andamento a cada rodada e o QR nunca terminaria de valer.

/** `connection` do Chatwoot: `close` · `connecting` · `reconnecting` · `open`. */
export type ConexaoBaileys = {
  connection: string | null;
  qr: string | null;
  erro: string | null;
};

async function corpoErro(r: Response): Promise<string> {
  const t = await r.text().catch(() => "");
  try {
    const j = JSON.parse(t);
    const m = j?.message ?? j?.error ?? j?.errors;
    return typeof m === "string" ? m : JSON.stringify(m ?? j).slice(0, 300);
  } catch {
    return t.slice(0, 300) || `HTTP ${r.status}`;
  }
}

/**
 * Acha um inbox WhatsApp pelo telefone.
 *
 * O `phone_number` de um `Channel::Whatsapp` é único na instância inteira do Chatwoot: criar um
 * inbox para um número que já tem um é recusado com 422. Isso não é um erro a mostrar para o dono —
 * é o caso normal de religar um chip cujo inbox continua lá. Reaproveitar o inbox existente também
 * preserva as conversas: um inbox novo começaria vazio e o histórico ficaria órfão no antigo.
 */
export async function acharInboxWhatsappPorTelefone(e164: string): Promise<number | null> {
  const { url, token, accountId } = cfgCw();
  if (!url || !token) return null;
  const alvo = e164.trim();
  if (!alvo) return null;
  try {
    const r = await fetch(`${url}/api/v1/accounts/${accountId}/inboxes`, {
      headers: { api_access_token: token }, cache: "no-store",
    });
    if (!r.ok) return null;
    const corpo = await r.json().catch(() => null);
    const lista: any[] = Array.isArray(corpo?.payload) ? corpo.payload : Array.isArray(corpo) ? corpo : [];
    const inbox = lista.find((i) => String(i?.phone_number ?? "").trim() === alvo);
    return typeof inbox?.id === "number" ? inbox.id : null;
  } catch { return null; }
}

/**
 * Cria (ou reencontra) o inbox nativo do chip e grava o id no banco.
 *
 * `provider_config` vai com os mesmos dois campos do chip que já roda neste canal — o resto
 * (`webhook_verify_token`, URL e chave do baileys-api) o Chatwoot preenche sozinho a partir do
 * `BAILEYS_PROVIDER_*` da instância. Mandar URL ou chave daqui seria copiar credencial de serviço
 * para dentro de um payload nosso sem necessidade nenhuma.
 */
export async function criarInboxBaileys(opts: {
  chipId: number; nome: string; numeroE164: string;
}): Promise<ResultadoChatwoot> {
  const { url, token, accountId } = cfgCw();
  if (!url || !token) {
    return { ok: false, motivo: "sem_config", mensagem: "Chatwoot não configurado no painel (CHATWOOT_URL/CHATWOOT_TOKEN)." };
  }

  async function vincular(inboxId: number, jaExistia: boolean): Promise<ResultadoChatwoot> {
    await supabaseAdmin().from("chips").update({ chatwoot_inbox_id: inboxId }).eq("id", opts.chipId);
    return { ok: true, inbox_id: inboxId, ja_existia: jaExistia };
  }

  try {
    const r = await fetch(`${url}/api/v1/accounts/${accountId}/inboxes`, {
      method: "POST",
      headers: { api_access_token: token, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: opts.nome,
        channel: {
          type: "whatsapp",
          provider: "baileys",
          phone_number: opts.numeroE164,
          provider_config: { mark_as_read: true, presence_subscribe: false },
        },
      }),
    });

    if (!r.ok) {
      // 422 é quase sempre "este telefone já tem inbox". Procurar antes de desistir transforma o
      // erro no caminho feliz de religar um chip.
      const existente = await acharInboxWhatsappPorTelefone(opts.numeroE164);
      if (existente) return vincular(existente, true);
      return { ok: false, motivo: "falha", mensagem: await corpoErro(r) };
    }

    const corpo = await r.json().catch(() => null);
    const inboxId: number | null = corpo?.id ?? corpo?.payload?.id ?? null;
    if (!inboxId) return { ok: false, motivo: "falha", mensagem: "Chatwoot não retornou o id do inbox." };
    return vincular(inboxId, false);
  } catch (e) {
    return { ok: false, motivo: "falha", mensagem: String(e) };
  }
}

/**
 * Manda o Chatwoot abrir a conexão no baileys-api — é esta chamada que faz nascer o QR.
 *
 * Chamar de novo com a conexão já de pé recria o socket e joga fora um pareamento em andamento, e é
 * por isso que só o cadastro e o botão de reconectar chegam aqui: o polling da tela nunca chama.
 */
export async function abrirConexaoBaileys(inboxId: number): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  const { url, token, accountId } = cfgCw();
  if (!url || !token) return { ok: false, mensagem: "Chatwoot não configurado no painel." };
  try {
    const r = await fetch(`${url}/api/v1/accounts/${accountId}/inboxes/${inboxId}/setup_channel_provider`, {
      method: "POST", headers: { api_access_token: token, "Content-Type": "application/json" },
    });
    if (!r.ok) return { ok: false, mensagem: await corpoErro(r) };
    return { ok: true };
  } catch (e) {
    return { ok: false, mensagem: String(e) };
  }
}

/**
 * Estado do pareamento: o que a tela do Chatwoot mostra, lido pela API.
 *
 * Devolve `null` só quando a CONSULTA falha — a mesma disciplina do resto do projeto (§36): não
 * confundir Chatwoot fora do ar com "o chip caiu". `connection: 'close'` é dado; `null` é ignorância.
 */
export async function conexaoBaileys(inboxId: number): Promise<ConexaoBaileys | null> {
  const { url, token, accountId } = cfgCw();
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/api/v1/accounts/${accountId}/inboxes/${inboxId}`, {
      headers: { api_access_token: token }, cache: "no-store",
    });
    if (!r.ok) return null;
    const corpo = await r.json().catch(() => null);
    const pc = (corpo?.payload ?? corpo)?.provider_connection ?? {};
    return {
      connection: typeof pc.connection === "string" ? pc.connection : null,
      qr: typeof pc.qr_data_url === "string" && pc.qr_data_url ? pc.qr_data_url : null,
      erro: typeof pc.error === "string" && pc.error ? pc.error : null,
    };
  } catch { return null; }
}
