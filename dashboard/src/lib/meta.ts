// Camada da Graph API da Meta (WhatsApp Cloud API) — o único conector de WhatsApp do sistema.
// Usada pelas rotas do dashboard (Node runtime). O envio de conversa normalmente vai pelo
// Chatwoot (canal whatsapp_cloud); aqui ficam as coisas que o Chatwoot não entrega:
// verificar número + QUALIDADE/LIMITE (saber se está perto de banir) e GESTÃO de templates.
//
// Token = token permanente de "usuário do sistema" (System User) gerado no Meta Business
// (Etapa 5 da doc "Introdução à API de Nuvem"). É colado por número no cadastro do chip.

export const GRAPH = "https://graph.facebook.com/v21.0";

export type MotivoMeta =
  | "token" | "permissao" | "nao_encontrado" | "config" | "indisponivel"
  | "webhook"   // a Meta chamou a URL de callback e a verificação falhou
  | "conflito"; // o app já aponta para outra URL (outro número no mesmo app)

export type SaudeNumero = {
  numero: string | null;        // display_phone_number em E.164
  verified_name: string | null;
  quality_rating: string;       // GREEN | YELLOW | RED | UNKNOWN
  messaging_limit_tier: string; // TIER_250 | TIER_1K | TIER_10K | TIER_100K | TIER_UNLIMITED
  number_status: string;        // CONNECTED | PENDING | ...
  name_status: string | null;   // APPROVED | PENDING_REVIEW | ...
};

export type ResultadoMeta<T> =
  | ({ ok: true } & T)
  | { ok: false; motivo: MotivoMeta; mensagem: string };

// Teto diário aproximado por tier (para a UI "usado hoje vs limite"). Referência da doc
// "Limites de mensagens" — número de conversas iniciadas pela empresa em 24h.
export function tetoDoTier(tier: string): number | null {
  switch (tier) {
    case "TIER_50": return 50;
    case "TIER_250": return 250;
    case "TIER_1K": return 1000;
    case "TIER_10K": return 10000;
    case "TIER_100K": return 100000;
    case "TIER_UNLIMITED": return null; // sem teto
    default: return null;
  }
}

// Traduz o erro da Graph para um motivo/mensagem amigável mostrado no cadastro do número.
// `contexto` muda só o texto: nas chamadas de app o culpado costuma ser o par app_id/app_secret,
// não o token permanente do usuário do sistema.
function classificar(corpo: any, status: number, contexto: "numero" | "app" = "numero"): { motivo: MotivoMeta; mensagem: string } {
  const e = corpo?.error;
  const code = e?.code;
  const sub = e?.error_subcode;
  const msg = e?.message || `A Meta respondeu ${status}.`;
  // 2200 = a Meta chamou a URL de callback e não recebeu o eco do challenge.
  if (code === 2200) {
    return {
      motivo: "webhook",
      mensagem: `A Meta não conseguiu validar a URL de callback. Confira se o Chatwoot está no ar e acessível pela internet (HTTPS público). Resposta da Meta: ${msg}`,
    };
  }
  if (code === 190) {
    return contexto === "app"
      ? { motivo: "token", mensagem: "App ID ou App Secret inválidos. Copie os dois em Configurações do app → Básico, no painel da Meta." }
      : { motivo: "token", mensagem: "Token de acesso inválido ou expirado. Gere um novo token permanente de usuário do sistema no Meta Business." };
  }
  if (code === 10 || code === 200 || code === 299 || sub === 33) {
    return contexto === "app"
      ? { motivo: "permissao", mensagem: "Este App Secret não tem permissão de gerir o app informado. Confira se o App ID é o mesmo app onde o produto WhatsApp está configurado." }
      : { motivo: "permissao", mensagem: "O token não tem permissão (whatsapp_business_management / whatsapp_business_messaging) ou não está ligado a esta conta/WABA." };
  }
  if (status === 404 || code === 803) {
    return contexto === "app"
      ? { motivo: "nao_encontrado", mensagem: "App não encontrado na Meta. Confira o App ID colado." }
      : { motivo: "nao_encontrado", mensagem: "Número (phone_number_id) ou WABA não encontrado. Confira os ids colados." };
  }
  if (code === 100) return { motivo: "config", mensagem: `Parâmetro inválido: ${msg}` };
  return { motivo: "indisponivel", mensagem: String(msg) };
}

async function graph(path: string, token: string, init?: RequestInit): Promise<{ r: Response; corpo: any }> {
  const r = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const corpo = await r.json().catch(() => null);
  return { r, corpo };
}

// Confirma que o token funciona e devolve o número real + saúde (qualidade/limite/status).
// É o "conectou" do número: não há QR nem celular envolvido.
export async function verificarNumero(opts: { phoneNumberId: string; token: string }): Promise<ResultadoMeta<{ saude: SaudeNumero }>> {
  try {
    const fields = "display_phone_number,verified_name,quality_rating,messaging_limit_tier,status,name_status,code_verification_status";
    const { r, corpo } = await graph(`${encodeURIComponent(opts.phoneNumberId)}?fields=${fields}`, opts.token);
    if (!r.ok) return { ok: false, ...classificar(corpo, r.status) };
    const numero = corpo?.display_phone_number ? `+${String(corpo.display_phone_number).replace(/\D/g, "")}` : null;
    return {
      ok: true,
      saude: {
        numero,
        verified_name: corpo?.verified_name ?? null,
        quality_rating: corpo?.quality_rating ?? "UNKNOWN",
        messaging_limit_tier: corpo?.messaging_limit_tier ?? "TIER_250",
        number_status: corpo?.status ?? "UNKNOWN",
        name_status: corpo?.name_status ?? null,
      },
    };
  } catch (e) {
    return { ok: false, motivo: "indisponivel", mensagem: String(e) };
  }
}

// Assina a WABA ao app (necessário para a Meta entregar webhooks ao Chatwoot). Best-effort.
export async function subscribarWaba(opts: { wabaId: string; token: string }): Promise<ResultadoMeta<{}>> {
  try {
    const { r, corpo } = await graph(`${encodeURIComponent(opts.wabaId)}/subscribed_apps`, opts.token, { method: "POST" });
    if (!r.ok) return { ok: false, ...classificar(corpo, r.status) };
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: "indisponivel", mensagem: String(e) };
  }
}

// ── Webhook do app (o que antes era a etapa manual no painel da Meta) ───────────────────────
// Assinar a WABA ao app (acima) é só metade: a outra metade é dizer ao APP para onde mandar os
// eventos — a URL de callback + o token de verificação. No painel isso é "app → WhatsApp →
// Configuração"; na API é POST /{app-id}/subscriptions, autenticado com o **app access token**
// ("{app_id}|{app_secret}"), que é o único lugar onde o App Secret é obrigatório.

export const OBJETO_WEBHOOK = "whatsapp_business_account";
// Só `messages`: é o que o Chatwoot consome. Qualidade e status de template o SAVAN já lê por
// polling (chips-monitor / sync de templates), e mandá-los ao Chatwoot só geraria ruído.
export const CAMPOS_WEBHOOK = ["messages"];

export type AssinaturaApp = { object: string; callback_url: string; active: boolean; fields: string[] };

function tokenDeApp(appId: string, appSecret: string): string {
  return `${appId}|${appSecret}`;
}

// Lê as assinaturas de webhook já configuradas no app.
export async function listarAssinaturasApp(opts: { appId: string; appSecret: string }): Promise<ResultadoMeta<{ assinaturas: AssinaturaApp[] }>> {
  try {
    const { r, corpo } = await graph(`${encodeURIComponent(opts.appId)}/subscriptions`, tokenDeApp(opts.appId, opts.appSecret));
    if (!r.ok) return { ok: false, ...classificar(corpo, r.status, "app") };
    const assinaturas: AssinaturaApp[] = (corpo?.data ?? []).map((a: any) => ({
      object: a.object,
      callback_url: a.callback_url ?? "",
      active: a.active !== false,
      // a Graph devolve fields como [{ name, version }] (ou, em apps antigos, como string[])
      fields: (a.fields ?? []).map((f: any) => (typeof f === "string" ? f : f?.name)).filter(Boolean),
    }));
    return { ok: true, assinaturas };
  } catch (e) {
    return { ok: false, motivo: "indisponivel", mensagem: String(e) };
  }
}

// Aponta o webhook do app para a URL de callback do Chatwoot. A Meta valida a URL na hora
// (GET com hub.challenge) — se o Chatwoot não responder, a chamada falha com motivo "webhook".
//
// Guarda de conflito: um app tem UMA URL de callback por objeto. Se dois números do mesmo app
// forem cadastrados, o segundo sobrescreveria o webhook do primeiro e o calaria em silêncio.
// Por isso, se já existe assinatura apontando para outro lugar, paramos com motivo "conflito"
// e só seguimos com `forcar`.
export async function assinarWebhookApp(opts: {
  appId: string; appSecret: string; callbackUrl: string; verifyToken: string;
  campos?: string[]; forcar?: boolean;
}): Promise<ResultadoMeta<{ callback_anterior: string | null; ja_estava: boolean }>> {
  const campos = opts.campos?.length ? opts.campos : CAMPOS_WEBHOOK;

  const atuais = await listarAssinaturasApp({ appId: opts.appId, appSecret: opts.appSecret });
  if (!atuais.ok) return atuais;
  const atual = atuais.assinaturas.find((a) => a.object === OBJETO_WEBHOOK) ?? null;
  const anterior = atual?.callback_url || null;

  if (atual && anterior && anterior !== opts.callbackUrl && !opts.forcar) {
    return {
      ok: false,
      motivo: "conflito",
      mensagem: `Este app da Meta já envia os eventos de WhatsApp para outra URL (${anterior}) — provavelmente outro número cadastrado no mesmo app. Trocar agora calaria aquele número. Use um app por número, ou confirme a substituição.`,
    };
  }

  // já está como queremos (mesma URL e todos os campos): não re-dispara a verificação à toa
  if (atual && anterior === opts.callbackUrl && atual.active && campos.every((c) => atual.fields.includes(c))) {
    return { ok: true, callback_anterior: anterior, ja_estava: true };
  }

  // o POST SUBSTITUI a lista de campos do app, não soma. Apps configurados à mão costumam ter
  // vários campos assinados (qualidade, status de template…); mandar só `messages` os apagaria
  // em silêncio. Então unimos com o que já existe — o que precisamos entra, o resto fica.
  const camposFinais = [...new Set([...(atual?.fields ?? []), ...campos])];

  try {
    const qs = new URLSearchParams({
      object: OBJETO_WEBHOOK,
      callback_url: opts.callbackUrl,
      verify_token: opts.verifyToken,
      fields: camposFinais.join(","),
      include_values: "true",
    });
    const { r, corpo } = await graph(
      `${encodeURIComponent(opts.appId)}/subscriptions?${qs.toString()}`,
      tokenDeApp(opts.appId, opts.appSecret),
      { method: "POST" },
    );
    if (!r.ok) return { ok: false, ...classificar(corpo, r.status, "app") };
    if (corpo?.success === false) {
      return { ok: false, motivo: "indisponivel", mensagem: "A Meta recusou a assinatura do webhook sem detalhar o motivo." };
    }
    return { ok: true, callback_anterior: anterior, ja_estava: false };
  } catch (e) {
    return { ok: false, motivo: "indisponivel", mensagem: String(e) };
  }
}

export type TemplateMeta = {
  id?: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: unknown;
  quality_score?: string | null;
  rejected_reason?: string | null;
};

// Lista os templates da WABA com o status de aprovação (APPROVED/PENDING/REJECTED/...).
export async function listarTemplates(opts: { wabaId: string; token: string }): Promise<ResultadoMeta<{ templates: TemplateMeta[] }>> {
  try {
    const fields = "id,name,status,category,language,components,quality_score,rejected_reason";
    const { r, corpo } = await graph(`${encodeURIComponent(opts.wabaId)}/message_templates?fields=${fields}&limit=200`, opts.token);
    if (!r.ok) return { ok: false, ...classificar(corpo, r.status) };
    const templates: TemplateMeta[] = (corpo?.data ?? []).map((t: any) => ({
      id: t.id, name: t.name, status: t.status, category: t.category, language: t.language,
      components: t.components, quality_score: t.quality_score?.score ?? t.quality_score ?? null,
      rejected_reason: t.rejected_reason ?? null,
    }));
    return { ok: true, templates };
  } catch (e) {
    return { ok: false, motivo: "indisponivel", mensagem: String(e) };
  }
}

// Cria e submete um template à Meta para aprovação.
export async function criarTemplate(opts: {
  wabaId: string; token: string;
  body: { name: string; category: string; language: string; components: unknown[] };
}): Promise<ResultadoMeta<{ id: string; status: string; category: string }>> {
  try {
    const { r, corpo } = await graph(`${encodeURIComponent(opts.wabaId)}/message_templates`, opts.token, {
      method: "POST", body: JSON.stringify(opts.body),
    });
    if (!r.ok) return { ok: false, ...classificar(corpo, r.status) };
    return { ok: true, id: corpo?.id, status: corpo?.status ?? "PENDING", category: corpo?.category ?? opts.body.category };
  } catch (e) {
    return { ok: false, motivo: "indisponivel", mensagem: String(e) };
  }
}

export async function excluirTemplate(opts: { wabaId: string; token: string; name: string }): Promise<ResultadoMeta<{}>> {
  try {
    const { r, corpo } = await graph(`${encodeURIComponent(opts.wabaId)}/message_templates?name=${encodeURIComponent(opts.name)}`, opts.token, { method: "DELETE" });
    if (!r.ok) return { ok: false, ...classificar(corpo, r.status) };
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: "indisponivel", mensagem: String(e) };
  }
}
