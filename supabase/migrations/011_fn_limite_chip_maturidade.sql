-- SAVAN Recupera — 011: fn_limite_chip respeita a maturidade do chip
-- Precedência: limite_dia_override (manual) > curva do perfil (maturidade) > curva global.

create or replace function fn_limite_chip(p_chip_id int)
returns int
language plpgsql stable
set search_path = public
as $$
declare
  v_chip chips%rowtype;
  v_aq jsonb;
  v_chave text;
  v_dia int;
  v_lim int := 0;
  f jsonb;
begin
  select * into v_chip from chips where id = p_chip_id;
  if not found then return 0; end if;

  -- 1) limite manual definido pelo usuário tem prioridade absoluta
  if v_chip.limite_dia_override is not null then return v_chip.limite_dia_override; end if;
  if v_chip.data_ativacao is null then return 0; end if;
  v_dia := (current_date - v_chip.data_ativacao) + 1;

  -- 2) escolhe a curva conforme a maturidade (chip aquecido = ramp curto)
  if v_chip.maturidade = 'aquecido' then
    v_chave := coalesce(v_chip.aquecimento_perfil, 'aquecimento_rapido');
  else
    v_chave := coalesce(v_chip.aquecimento_perfil, 'aquecimento');
  end if;

  select valor into v_aq from configuracoes where chave = v_chave;
  if v_aq is null then
    select valor into v_aq from configuracoes where chave = 'aquecimento';  -- fallback
  end if;
  if v_aq is null then return 0; end if;

  for f in select * from jsonb_array_elements(v_aq) loop
    if v_dia >= (f->>'de')::int and v_dia <= (f->>'ate')::int then
      v_lim := (f->>'limite')::int;
    end if;
  end loop;
  return v_lim;
end;
$$;

-- mantém a função fora da API REST (idempotente; já revogada na 004)
revoke execute on function fn_limite_chip(int) from public, anon;
