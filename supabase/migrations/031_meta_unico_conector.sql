-- 031 — A API oficial da Meta (Cloud API) vira o ÚNICO conector de WhatsApp.
-- Fecha a §32: o caminho Z-API (WhatsApp Web não-oficial, QR Code) saiu do produto — painel,
-- Edge Functions e n8n já não falam com api.z-api.io. Aqui o schema acompanha.
-- Idempotente. Aplicar via MCP apply_migration (projeto wmggqsmqvklxlqwsksjs).

-- 1) Todo chip passa a ser meta_cloud --------------------------------------------------------
-- Chips que ficaram sem linha em chips_credenciais_meta simplesmente não são monitorados nem
-- selecionados para disparo até alguém preencher as credenciais da Meta na edição do chip.
alter table chips alter column conector set default 'meta_cloud';
update chips set conector = 'meta_cloud' where conector is distinct from 'meta_cloud';

alter table chips drop constraint if exists chips_conector_check;
alter table chips add constraint chips_conector_check check (conector in ('meta_cloud'));
comment on column chips.conector is
  'Conector do chip. Só existe um: meta_cloud (API oficial do WhatsApp / Meta Cloud API).';

-- 2) Credenciais Z-API ------------------------------------------------------------------------
-- A tabela chips_credenciais guarda instance_id/token/client_token da Z-API e NÃO é mais lida por
-- nada. Deixar de propósito para você conferir antes: são segredos, e apagar não tem volta.
-- Depois de confirmar que não precisa mais deles, rode:
--
--   drop table if exists public.chips_credenciais;
--   delete from segredos where chave = 'ZAPI_CLIENT_TOKEN';
--
-- (o mesmo vale para ZAPI_CLIENT_TOKEN / ZAPI_URL no .env do painel e no n8n)
