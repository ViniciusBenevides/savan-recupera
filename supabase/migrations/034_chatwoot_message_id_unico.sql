-- O mesmo evento pode chegar pela resposta da API e pelo webhook do Chatwoot.
-- NULL continua permitido para registros historicos ainda nao reconciliados.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mensagens_chatwoot_message_id_key'
      and conrelid = 'mensagens'::regclass
  ) then
    alter table mensagens
      add constraint mensagens_chatwoot_message_id_key unique (chatwoot_message_id);
  end if;
end
$$;
