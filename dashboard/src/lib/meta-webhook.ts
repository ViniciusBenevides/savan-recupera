import { supabaseAdmin } from "@/lib/supabase-server";
import { assinarWebhookApp } from "@/lib/meta";
import { confirmarAutorizacaoInboxMeta, dadosWebhookInbox } from "@/lib/chatwoot";

// Fecha sozinho o último passo manual do cadastro de número: apontar o webhook do app da Meta
// para o inbox Cloud do Chatwoot. Quem dá a URL de callback e o verify token é o Chatwoot; quem
// registra é a Graph API (POST /{app-id}/subscriptions, com app_id + app_secret).
//
// É best-effort por desenho: sem app_id/app_secret, ou se a Meta não conseguir validar a URL, o
// número continua conectado e o painel volta a mostrar o passo manual como alternativa. Por isso
// o retorno sempre carrega callback_url/verify_token — é o que a UI precisa para o plano B.

export type ResultadoWebhookChip = {
  ok: boolean;
  motivo: "configurado" | "ja_estava" | "sem_credenciais" | "sem_chatwoot" | "conflito" | "webhook" | "token" | "permissao" | "nao_encontrado" | "config" | "indisponivel";
  mensagem: string;
  callback_url: string | null;
  verify_token: string | null;
};

export async function configurarWebhookDoChip(opts: {
  chipId: number;
  appId: string | null;
  appSecret: string | null;
  callbackUrl: string | null;
  verifyToken: string | null;
  forcar?: boolean;
}): Promise<ResultadoWebhookChip> {
  const base = { callback_url: opts.callbackUrl, verify_token: opts.verifyToken };

  if (!opts.callbackUrl || !opts.verifyToken) {
    return {
      ok: false, motivo: "sem_chatwoot", ...base,
      mensagem: "O inbox do Chatwoot não devolveu a URL de callback / token de verificação, então não há para onde apontar o webhook.",
    };
  }
  if (!opts.appId || !opts.appSecret) {
    return {
      ok: false, motivo: "sem_credenciais", ...base,
      mensagem: "Informe o App ID e o App Secret para o SAVAN configurar o webhook sozinho. Sem eles, cole a URL e o token no painel da Meta.",
    };
  }

  const r = await assinarWebhookApp({
    appId: opts.appId, appSecret: opts.appSecret,
    callbackUrl: opts.callbackUrl, verifyToken: opts.verifyToken,
    forcar: opts.forcar,
  });
  if (!r.ok) return { ok: false, motivo: r.motivo, mensagem: r.mensagem, ...base };

  const admin = supabaseAdmin();
  await admin.from("chips_credenciais_meta").update({
    webhook_callback_url: opts.callbackUrl,
    webhook_verify_token: opts.verifyToken,
    webhook_configurado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  }).eq("chip_id", opts.chipId);

  const { data: chip } = await admin.from("chips").select("chatwoot_inbox_id").eq("id", opts.chipId).maybeSingle();
  if (chip?.chatwoot_inbox_id && !(await confirmarAutorizacaoInboxMeta(chip.chatwoot_inbox_id))) {
    return {
      ok: false,
      motivo: "sem_chatwoot",
      mensagem: "O webhook foi validado pela Meta, mas o Chatwoot nao confirmou novamente as credenciais do inbox.",
      ...base,
    };
  }

  return {
    ok: true,
    motivo: r.ja_estava ? "ja_estava" : "configurado",
    mensagem: r.ja_estava
      ? "O app da Meta já apontava para este inbox — nada a mudar."
      : "Webhook configurado no app da Meta e validado por ela.",
    ...base,
  };
}

// Recupera de onde der (banco → Chatwoot) o par callback_url/verify_token de um chip já
// cadastrado, para poder reconfigurar o webhook depois — por exemplo quando o dono só informa
// o App ID/Secret na edição, depois de já ter conectado o número.
export async function dadosWebhookDoChip(chipId: number): Promise<{ callback_url: string | null; verify_token: string | null }> {
  const admin = supabaseAdmin();
  const [{ data: cred }, { data: chip }] = await Promise.all([
    admin.from("chips_credenciais_meta").select("webhook_callback_url, webhook_verify_token").eq("chip_id", chipId).maybeSingle(),
    admin.from("chips").select("chatwoot_inbox_id").eq("id", chipId).maybeSingle(),
  ]);
  if (cred?.webhook_callback_url && cred?.webhook_verify_token) {
    return { callback_url: cred.webhook_callback_url, verify_token: cred.webhook_verify_token };
  }
  if (!chip?.chatwoot_inbox_id) return { callback_url: cred?.webhook_callback_url ?? null, verify_token: cred?.webhook_verify_token ?? null };

  const doInbox = await dadosWebhookInbox(chip.chatwoot_inbox_id);
  return {
    callback_url: doInbox?.callback_url ?? cred?.webhook_callback_url ?? null,
    verify_token: doInbox?.verify_token ?? cred?.webhook_verify_token ?? null,
  };
}
