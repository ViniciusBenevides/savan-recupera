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
