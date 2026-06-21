import { supabaseAdmin } from "@/lib/supabase-server";
import { criarInbox, atualizarTelefoneInbox, deletarInbox } from "@/lib/chatwoot";

export function zapiBase(instanceId: string, token: string) {
  return `https://api.z-api.io/instances/${instanceId}/token/${token}`;
}

// Número real do aparelho conectado (o /status NÃO traz o telefone; o /device traz).
export async function obterTelefone(base: string, clientToken: string): Promise<string | null> {
  try {
    const r = await fetch(`${base}/device`, { headers: { "Client-Token": clientToken } });
    const d = await r.json().catch(() => ({}));
    if (!d?.phone) return null;
    return `+${String(d.phone).replace(/^\+/, "")}`;
  } catch { return null; }
}

// Aponta os webhooks da instância Z-API para o Chatwoot. update-every-webhooks
// configura todos os tipos de uma vez; caímos no update-webhook-received se a
// versão da instância não tiver o endpoint em lote.
export async function definirWebhooks(base: string, clientToken: string, url: string): Promise<{ ok: boolean; mensagem?: string }> {
  const headers = { "Client-Token": clientToken, "Content-Type": "application/json" };
  const body = JSON.stringify({ value: url });
  const tentativas: Array<[string, "PUT" | "POST"]> = [
    ["update-every-webhooks", "PUT"], ["update-every-webhooks", "POST"],
    ["update-webhook-received", "PUT"], ["update-webhook-received", "POST"],
  ];
  for (const [ep, method] of tentativas) {
    try {
      const r = await fetch(`${base}/${ep}`, { method, headers, body });
      if (r.ok) return { ok: true };
    } catch { /* tenta o próximo */ }
  }
  return { ok: false, mensagem: "Não foi possível configurar o webhook na Z-API." };
}

export type Finalizacao = {
  telefone: string | null;
  telefone_ok: boolean;
  webhook_ok: boolean;
  chatwoot_ok: boolean;
  inbox_id: number | null;
  mensagem?: string;
};

// Roda uma vez quando o chip conecta: descobre o número real, ajusta o inbox do
// Chatwoot para esse número e aponta os webhooks da Z-API para o Chatwoot. Sem
// isso o inbox fica com número-placeholder e as mensagens recebidas não roteiam.
export async function finalizarConexaoChip(opts: {
  chipId: number; instanceId: string; token: string; clientToken: string;
}): Promise<Finalizacao> {
  const { chipId, instanceId, token, clientToken } = opts;
  const admin = supabaseAdmin();
  const base = zapiBase(instanceId, token);

  const telefone = await obterTelefone(base, clientToken);
  const { data: chip } = await admin
    .from("chips").select("nome, status, chatwoot_inbox_id").eq("id", chipId).maybeSingle();
  const nome = chip?.nome ?? `Chip ${chipId}`;
  let inboxId: number | null = chip?.chatwoot_inbox_id ?? null;
  let chatwoot_ok = false, telefone_ok = false;
  let mensagem: string | undefined;

  if (telefone) {
    if (inboxId) {
      const upd = await atualizarTelefoneInbox(inboxId, telefone);
      if (upd.ok) { chatwoot_ok = true; telefone_ok = true; }
      else {
        // não deu para ajustar o número → recria o inbox já com o número certo
        await deletarInbox(inboxId);
        const cr = await criarInbox({ chipId, nome, instanceId, token, clientToken, phoneNumber: telefone });
        if (cr.ok) { inboxId = cr.inbox_id; chatwoot_ok = true; telefone_ok = true; }
        else mensagem = cr.mensagem;
      }
    } else {
      const cr = await criarInbox({ chipId, nome, instanceId, token, phoneNumber: telefone });
      if (cr.ok) { inboxId = cr.inbox_id; chatwoot_ok = true; telefone_ok = true; }
      else mensagem = cr.mensagem;
    }
  } else {
    mensagem = "A Z-API não retornou o número do aparelho.";
  }

  // webhook da Z-API → endpoint do canal no Chatwoot (derivado do número real)
  let webhook_ok = false;
  const cwUrl = process.env.CHATWOOT_URL?.trim();
  if (telefone && cwUrl) {
    const wh = await definirWebhooks(base, clientToken, `${cwUrl}/webhooks/whatsapp/${telefone}`);
    webhook_ok = wh.ok;
    if (!wh.ok && !mensagem) mensagem = wh.mensagem;
  }

  const patch: Record<string, unknown> = {
    numero_e164: telefone,
    saude: { connected: true, telefone_ok, webhook_ok, chatwoot_ok, inbox_id: inboxId, finalizado_em: new Date().toISOString() },
  };
  // só promove a "conectado" se ainda não estava em um estado operacional
  if (chip?.status === "cadastrado" || chip?.status === "desconectado") patch.status = "conectado";
  await admin.from("chips").update(patch).eq("id", chipId);

  return { telefone, telefone_ok, webhook_ok, chatwoot_ok, inbox_id: inboxId, mensagem };
}
