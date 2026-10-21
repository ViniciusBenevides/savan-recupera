-- MC COB passa para uma conta própria no Chatwoot (21/10/2026)
--
-- Até aqui o MC COB usava a conta 1 do Chatwoot, que não é só dele. A conta nova (2) numera as
-- conversas a partir do 1 de novo, e `conversas.chatwoot_conversation_id` é único: sem esta
-- migration, a primeira conversa da conta nova "acharia" a conversa antiga de mesmo número e
-- misturaria o dossiê de dois devedores.
--
-- O que a conta 1 deixou fica guardado nas colunas `*_conta1`:
-- - números de conversa (NOT NULL): viram negativos. A conta nova só gera positivos, e o
--   valor original é o absoluto. Chamada ao Chatwoot com eles dá 404, que é o certo.
-- - contato e inbox (nullable): ficam nulos. O contato é recriado na conta nova quando o devedor
--   for procurado de novo; a adoção do `chatwoot-sync` amarra a conversa nova à linha antiga.
--
-- `fn_touch_atualizado_em` marcaria as 1.021 conversas como "mexidas agora" e bagunçaria a ordem
-- das filas do painel; os dois gatilhos de toque ficam desligados só dentro desta transação.

begin;

alter table public.conversas disable trigger trg_touch_conversas;
alter table public.devedores disable trigger trg_touch_devedores;

alter table public.conversas
  add column chatwoot_conversation_id_conta1 integer,
  add column chatwoot_contact_id_conta1 integer,
  add column chatwoot_inbox_id_conta1 integer;
alter table public.devedores add column chatwoot_contact_id_conta1 integer;
alter table public.fila_envios add column chatwoot_conversation_id_conta1 integer;
alter table public.bot_fila_mensagens add column chatwoot_conversation_id_conta1 integer;

update public.conversas set
  chatwoot_conversation_id_conta1 = chatwoot_conversation_id,
  chatwoot_contact_id_conta1 = chatwoot_contact_id,
  chatwoot_inbox_id_conta1 = chatwoot_inbox_id,
  chatwoot_conversation_id = -chatwoot_conversation_id,
  chatwoot_contact_id = null,
  chatwoot_inbox_id = null
where chatwoot_conversation_id > 0;

update public.devedores set
  chatwoot_contact_id_conta1 = chatwoot_contact_id,
  chatwoot_contact_id = null
where chatwoot_contact_id is not null;

update public.fila_envios set
  chatwoot_conversation_id_conta1 = chatwoot_conversation_id,
  chatwoot_conversation_id = -chatwoot_conversation_id
where chatwoot_conversation_id > 0;

update public.bot_fila_mensagens set
  chatwoot_conversation_id_conta1 = chatwoot_conversation_id,
  chatwoot_conversation_id = -chatwoot_conversation_id
where chatwoot_conversation_id > 0;

alter table public.conversas enable trigger trg_touch_conversas;
alter table public.devedores enable trigger trg_touch_devedores;

comment on column public.conversas.chatwoot_conversation_id is
  'Número da conversa na conta do MC COB no Chatwoot. Negativo = conversa da conta 1 (antes de 21/10/2026), guardada em chatwoot_conversation_id_conta1.';
comment on column public.conversas.chatwoot_conversation_id_conta1 is
  'Número da conversa na conta 1 do Chatwoot, usada até 21/10/2026. Só histórico.';
comment on column public.devedores.chatwoot_contact_id_conta1 is
  'Contato do devedor na conta 1 do Chatwoot, usada até 21/10/2026. Só histórico.';

commit;
