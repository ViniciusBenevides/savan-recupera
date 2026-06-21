-- SAVAN Recupera — 013: dados para a sugestão de distribuição
-- Retorna o total da fila aguardando da carteira e a contagem por UF e por cidade.

create or replace function fn_distribuicao_dados(p_carteira_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', (
      select count(*) from fila_envios fe
      where fe.carteira_id = p_carteira_id and fe.status = 'aguardando'
    ),
    'por_uf', (
      select coalesce(jsonb_agg(jsonb_build_object('uf', uf, 'n', n) order by n desc), '[]'::jsonb)
      from (
        select coalesce(d.uf, '??') as uf, count(*) as n
        from fila_envios fe join devedores d on d.id = fe.devedor_id
        where fe.carteira_id = p_carteira_id and fe.status = 'aguardando'
        group by d.uf
      ) t
    ),
    'por_cidade', (
      select coalesce(jsonb_agg(jsonb_build_object('cidade', cidade, 'uf', uf, 'n', n) order by n desc), '[]'::jsonb)
      from (
        select coalesce(d.cidade, '??') as cidade, coalesce(d.uf, '??') as uf, count(*) as n
        from fila_envios fe join devedores d on d.id = fe.devedor_id
        where fe.carteira_id = p_carteira_id and fe.status = 'aguardando'
        group by d.cidade, d.uf
        order by n desc
        limit 200
      ) t
    )
  );
$$;

revoke execute on function fn_distribuicao_dados(bigint) from public, anon;
