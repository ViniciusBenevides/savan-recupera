-- SAVAN Recupera — 004: hardening (advisors)

-- search_path fixo na função de touch
create or replace function fn_touch_atualizado_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- pg_trgm fora do public
alter extension pg_trgm set schema extensions;

-- funções internas não podem ser chamadas via API REST
revoke execute on function fn_handle_novo_usuario() from public, anon, authenticated;
revoke execute on function fn_pagamento_confirmado() from public, anon, authenticated;
revoke execute on function fn_touch_atualizado_em() from public, anon, authenticated;
revoke execute on function fn_selecionar_lote(int, int) from public, anon, authenticated;
revoke execute on function fn_limite_chip(int) from public, anon;
revoke execute on function fn_proposta(bigint) from public, anon;
revoke execute on function fn_role() from public, anon;
