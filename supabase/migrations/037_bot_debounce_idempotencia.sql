-- Debounce/idempotencia do bot negociador.
--
-- O Chatwoot dispara um webhook por mensagem. Quando a pessoa envia duas mensagens
-- curtas em sequencia, o n8n abre duas execucoes concorrentes. Esta fila registra
-- cada message_id uma unica vez, enquanto o lock garante apenas uma IA por conversa.

create table if not exists bot_fila_mensagens (
  id bigint generated always as identity primary key,
  chatwoot_conversation_id int not null,
  chatwoot_message_id bigint,
  conteudo text,
  tipo text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_bot_fila_conversa
  on bot_fila_mensagens (chatwoot_conversation_id, id);

create unique index if not exists idx_bot_fila_message_id_unico
  on bot_fila_mensagens (chatwoot_message_id)
  where chatwoot_message_id is not null;

create table if not exists bot_locks (
  chatwoot_conversation_id int primary key,
  locked_at timestamptz not null default now()
);

alter table bot_fila_mensagens enable row level security;
alter table bot_locks enable row level security;
revoke all on table bot_fila_mensagens from anon, authenticated;
revoke all on table bot_locks from anon, authenticated;
grant select, insert, update, delete on table bot_fila_mensagens to service_role;
grant select, insert, update, delete on table bot_locks to service_role;
grant usage, select on sequence bot_fila_mensagens_id_seq to service_role;

-- A aquisicao precisa ser atomica. Um lock abandonado por erro da Edge Function
-- pode ser retomado depois do prazo, evitando conversa travada indefinidamente.
create or replace function fn_bot_tentar_lock(
  p_chatwoot_conversation_id int,
  p_expira_segundos int default 120
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_locked int;
begin
  insert into public.bot_locks as atual (chatwoot_conversation_id, locked_at)
  values (p_chatwoot_conversation_id, now())
  on conflict (chatwoot_conversation_id) do update
    set locked_at = excluded.locked_at
    where atual.locked_at < now() - make_interval(secs => greatest(p_expira_segundos, 30))
  returning chatwoot_conversation_id into v_locked;

  return v_locked is not null;
end;
$$;

revoke all on function fn_bot_tentar_lock(int, int) from public, anon, authenticated;
grant execute on function fn_bot_tentar_lock(int, int) to service_role;
