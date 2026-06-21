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

// Telefone-placeholder único por chip (usado só enquanto o número real é desconhecido,
// antes do chip conectar). O Chatwoot exige phone_number único por canal WhatsApp.
export function telefonePlaceholder(chipId: number): string {
  return `+5511${("9" + String(chipId).padStart(8, "0")).slice(-9)}`;
}

// Cria o inbox WhatsApp/Z-API no Chatwoot e grava o id no chip. O client_token
// (token de segurança da Z-API) entra no provider_config — é ele que liga o
// Chatwoot à instância. Sem ele o canal não recebe nem envia.
export async function criarInbox(opts: {
  chipId: number; nome: string; instanceId: string; token: string; phoneNumber: string; clientToken?: string;
}): Promise<ResultadoChatwoot> {
  const { url, token: cwTok, accountId } = cfgCw();
  const clientToken = opts.clientToken?.trim() || process.env.ZAPI_CLIENT_TOKEN?.trim();
  if (!url || !cwTok) return { ok: false, motivo: "sem_config", mensagem: "Chatwoot não configurado no painel (CHATWOOT_URL/CHATWOOT_TOKEN)." };
  if (!clientToken) {
    return { ok: false, motivo: "sem_config", mensagem: "Token de segurança da Z-API ausente — informe-o no cadastro do chip." };
  }
  const appName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Recupera";
  try {
    const r = await fetch(`${url}/api/v1/accounts/${accountId}/inboxes`, {
      method: "POST",
      headers: { api_access_token: cwTok, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${appName} ${opts.nome}`,
        channel: {
          type: "whatsapp",
          provider: "zapi",
          phone_number: opts.phoneNumber,
          provider_config: { instance_id: opts.instanceId, token: opts.token, client_token: clientToken },
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
    await supabaseAdmin().from("chips").update({ chatwoot_inbox_id: inboxId }).eq("id", opts.chipId);
    return { ok: true, inbox_id: inboxId };
  } catch (e) {
    return { ok: false, motivo: "falha", mensagem: String(e) };
  }
}

// (Re)vincula um inbox a um chip. Idempotente: se já houver inbox, reaproveita.
// Usa o telefone-placeholder (o número real só é conhecido após conectar).
export async function vincularChatwootInbox(opts: {
  chipId: number; nome: string; instanceId: string; token: string; clientToken?: string; forcar?: boolean;
}): Promise<ResultadoChatwoot> {
  if (!opts.forcar) {
    const { data: chip } = await supabaseAdmin()
      .from("chips").select("chatwoot_inbox_id").eq("id", opts.chipId).maybeSingle();
    if (chip?.chatwoot_inbox_id) return { ok: true, inbox_id: chip.chatwoot_inbox_id, ja_existia: true };
  }
  return criarInbox({ ...opts, phoneNumber: telefonePlaceholder(opts.chipId) });
}

// Atualiza o phone_number do inbox e confirma que aplicou (o webhook do fork é
// derivado do número — se não bater, as mensagens recebidas não roteiam).
export async function atualizarTelefoneInbox(inboxId: number, phoneNumber: string): Promise<{ ok: boolean; mensagem?: string }> {
  const { url, token, accountId } = cfgCw();
  if (!url || !token) return { ok: false, mensagem: "Chatwoot não configurado." };
  try {
    const r = await fetch(`${url}/api/v1/accounts/${accountId}/inboxes/${inboxId}`, {
      method: "PATCH",
      headers: { api_access_token: token, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: { phone_number: phoneNumber } }),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => null);
      return { ok: false, mensagem: b?.message || b?.error || `Chatwoot respondeu ${r.status}.` };
    }
    const d = await r.json().catch(() => null);
    if (d?.phone_number && d.phone_number !== phoneNumber) {
      return { ok: false, mensagem: "Chatwoot não aplicou o novo número." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, mensagem: String(e) };
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
