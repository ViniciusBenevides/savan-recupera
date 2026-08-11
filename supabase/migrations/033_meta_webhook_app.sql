-- 033 — Webhook do app da Meta configurado pelo próprio SAVAN (fim da etapa manual do cadastro).
-- Até aqui o dono do número precisava abrir o painel da Meta (app → WhatsApp → Configuração) e
-- colar à mão a URL de callback + o token de verificação do Chatwoot. Isso é só um
-- POST /{app-id}/subscriptions na Graph API, que exige o **app access token** = "{app_id}|{app_secret}".
-- Guardamos então o app_id (o app_secret já existia) e o estado do que foi assinado.
-- Idempotente. Aplicar via MCP apply_migration (projeto wmggqsmqvklxlqwsksjs).

alter table chips_credenciais_meta add column if not exists app_id text;
alter table chips_credenciais_meta add column if not exists webhook_callback_url text;
alter table chips_credenciais_meta add column if not exists webhook_configurado_em timestamptz;

comment on column chips_credenciais_meta.app_id is
  'ID do app na Meta. Com o app_secret forma o app access token ("{app_id}|{app_secret}"), usado para assinar o webhook do app sem passar pelo painel.';
comment on column chips_credenciais_meta.app_secret is
  'Chave secreta do app. Necessária (com app_id) para o SAVAN configurar o webhook sozinho; também valida X-Hub-Signature-256 no dia em que recebermos webhook direto.';
comment on column chips_credenciais_meta.webhook_callback_url is
  'URL de callback que o SAVAN registrou no app da Meta (a do inbox Cloud no Chatwoot). Serve para detectar conflito quando dois números dividem o mesmo app.';
comment on column chips_credenciais_meta.webhook_configurado_em is
  'Quando a assinatura whatsapp_business_account foi confirmada pela Meta. Nulo = webhook ainda pendente (o painel mostra o passo manual como alternativa).';
