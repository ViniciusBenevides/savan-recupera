-- 031 — A API oficial da Meta (Cloud API) vira o ÚNICO conector de WhatsApp.
-- Painel, Edge Functions, n8n e schema usam exclusivamente a integração oficial.
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
