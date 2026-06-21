-- SAVAN Recupera — 012: distribuição de carteira entre chips
-- fn_selecionar_lote passa a respeitar o chip designado; fn_distribuir_carteira carimba a fila.

-- ===== fn_selecionar_lote: respeita a designação =====
-- Um chip pega: (1) os devedores designados a ele, depois (2) os do pool livre (designado = null).
-- Anti-repetição preservada (FOR UPDATE SKIP LOCKED + status='processando').
create or replace function fn_selecionar_lote(p_chip_id integer, p_n integer)
returns setof fila_envios
language sql
set search_path = public
as $$
  update fila_envios
  set status = 'processando', chip_id = p_chip_id
  where id in (
    select fe.id from fila_envios fe
    where fe.status = 'aguardando'
      and (fe.agendado_para is null or fe.agendado_para <= now())
      and (fe.chip_designado_id = p_chip_id or fe.chip_designado_id is null)
      and exists (
        select 1 from devedores d
        join carteiras c on c.id = d.carteira_id
        where d.id = fe.devedor_id and c.status = 'ativa'
      )
    order by (fe.chip_designado_id = p_chip_id) desc nulls last, fe.prioridade desc, fe.id
    limit p_n
    for update skip locked
  )
  returning *;
$$;

revoke execute on function fn_selecionar_lote(int, int) from public, anon, authenticated;

-- ===== fn_distribuir_carteira: (re)carimba chip_designado_id da fila aguardando =====
-- igualitario  → round-robin por contagem entre chips utilizáveis
-- uf / cidade  → usa os arrays chips.regiao_uf / chips.regiao_cidade
-- manual       → uf primeiro, depois cidade para o que sobrar
-- Devedores sem região coberta ficam com designado = null (pool livre) = qualquer chip pega.
create or replace function fn_distribuir_carteira(p_carteira_id bigint, p_estrategia text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_total int;
begin
  -- reset das designações atuais (apenas fila aguardando da carteira) — idempotente
  update fila_envios set chip_designado_id = null
  where carteira_id = p_carteira_id and status = 'aguardando';

  if p_estrategia = 'igualitario' then
    with usaveis as (
      select id, (row_number() over (order by id)) - 1 as idx
      from chips where status in ('cadastrado','conectado','aquecendo','ativo')
    ),
    cnt as (select count(*)::int c from usaveis),
    fila as (
      select fe.id, (row_number() over (order by fe.prioridade desc, fe.id)) - 1 as rn
      from fila_envios fe
      where fe.carteira_id = p_carteira_id and fe.status = 'aguardando'
    )
    update fila_envios f
    set chip_designado_id = u.id
    from fila, usaveis u, cnt
    where f.id = fila.id and cnt.c > 0 and u.idx = (fila.rn % cnt.c);

  elsif p_estrategia in ('uf','manual') then
    update fila_envios f
    set chip_designado_id = c.id
    from devedores d, chips c
    where f.devedor_id = d.id
      and f.carteira_id = p_carteira_id and f.status = 'aguardando'
      and c.status in ('cadastrado','conectado','aquecendo','ativo')
      and c.regiao_uf is not null
      and d.uf = any(c.regiao_uf);

    if p_estrategia = 'manual' then
      update fila_envios f
      set chip_designado_id = c.id
      from devedores d, chips c
      where f.devedor_id = d.id
        and f.carteira_id = p_carteira_id and f.status = 'aguardando'
        and f.chip_designado_id is null
        and c.status in ('cadastrado','conectado','aquecendo','ativo')
        and c.regiao_cidade is not null
        and d.cidade = any(c.regiao_cidade);
    end if;

  elsif p_estrategia = 'cidade' then
    update fila_envios f
    set chip_designado_id = c.id
    from devedores d, chips c
    where f.devedor_id = d.id
      and f.carteira_id = p_carteira_id and f.status = 'aguardando'
      and c.status in ('cadastrado','conectado','aquecendo','ativo')
      and c.regiao_cidade is not null
      and d.cidade = any(c.regiao_cidade);
  end if;

  select count(*) into v_total from fila_envios
  where carteira_id = p_carteira_id and status = 'aguardando' and chip_designado_id is not null;
  return v_total;
end;
$$;

revoke execute on function fn_distribuir_carteira(bigint, text) from public, anon, authenticated;
