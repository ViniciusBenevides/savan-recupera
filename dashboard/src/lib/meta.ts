// Camada da Graph API da Meta (WhatsApp Cloud API) — espelha lib/zapi.ts.
// Usada pelas rotas do dashboard (Node runtime). O envio de conversa normalmente vai pelo
// Chatwoot (canal whatsapp_cloud); aqui ficam as coisas que o Chatwoot não entrega:
// verificar número + QUALIDADE/LIMITE (saber se está perto de banir) e GESTÃO de templates.
//
// Token = token permanente de "usuário do sistema" (System User) gerado no Meta Business
// (Etapa 5 da doc "Introdução à API de Nuvem"). É colado por número no cadastro do chip.

export const GRAPH = "https://graph.facebook.com/v21.0";

export type MotivoMeta = "token" | "permissao" | "nao_encontrado" | "config" | "indisponivel";

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

// Traduz o erro da Graph para um motivo/mensagem amigável (padrão do proxy de QR do Z-API).
function classificar(corpo: any, status: number): { motivo: MotivoMeta; mensagem: string } {
  const e = corpo?.error;
  const code = e?.code;
  const sub = e?.error_subcode;
  const msg = e?.message || `A Meta respondeu ${status}.`;
  if (code === 190) return { motivo: "token", mensagem: "Token de acesso inválido ou expirado. Gere um novo token permanente de usuário do sistema no Meta Business." };
  if (code === 10 || code === 200 || code === 299 || sub === 33) return { motivo: "permissao", mensagem: "O token não tem permissão (whatsapp_business_management / whatsapp_business_messaging) ou não está ligado a esta conta/WABA." };
  if (status === 404 || code === 803) return { motivo: "nao_encontrado", mensagem: "Número (phone_number_id) ou WABA não encontrado. Confira os ids colados." };
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
// É o "conectou" do conector Meta (não há QR).
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
