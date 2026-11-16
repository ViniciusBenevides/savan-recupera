-- Disparos no formato do MC COB V5.9.02 ("O que você quer cobrar agora?"), 16/11/2026.
-- O dono escolhe a carteira e QUEM chamar pela faixa de atraso. A fila continua a mesma e anda
-- sozinha no ritmo de cada linha; o filtro só decide quem dela pode receber a primeira mensagem.
-- Sem faixa escolhida (null) = todos, que é o comportamento de antes.

alter table carteiras
  add column if not exists publico_faixa text
    check (publico_faixa in ('lt1', '1a2', '2a3', '3a4', '4a5', '5mais', 'sem'));
comment on column carteiras.publico_faixa is
  'Faixa de atraso que o disparo chama (mesmas faixas da tela Atraso / prescrição). null = todos.';

-- Faixa de atraso pela data de vencimento, no calendário de São Paulo. Espelha
-- faixaDoVencimento (dashboard/src/lib/recuperacao.ts): os cortes são anos de calendário, 5 anos
-- exatos já é "5 anos ou mais", sem vencimento é "sem" e quem ainda não venceu fica em "lt1".
create or replace function fn_faixa_atraso(p_vencimento date)
returns text
language sql
stable
set search_path = public
as $$
  with h as (select (now() at time zone 'America/Sao_Paulo')::date as hoje)
  select case
    when p_vencimento is null then 'sem'
    when p_vencimento > (h.hoje - interval '1 year')::date then 'lt1'
    when p_vencimento > (h.hoje - interval '2 years')::date then '1a2'
    when p_vencimento > (h.hoje - interval '3 years')::date then '2a3'
    when p_vencimento > (h.hoje - interval '4 years')::date then '3a4'
    when p_vencimento > (h.hoje - interval '5 years')::date then '4a5'
    else '5mais'
  end
  from h;
$$;

-- Quantos esperam na fila da carteira, por faixa. Para a tela de Disparos mostrar o tamanho do
-- público antes de iniciar.
create or replace function fn_fila_por_faixa(p_carteira_id bigint)
returns table (faixa text, n bigint)
language sql
stable
set search_path = public
as $$
  select fn_faixa_atraso(d.vencimento) as faixa, count(*) as n
  from fila_envios fe
  join devedores d on d.id = fe.devedor_id
  where fe.carteira_id = p_carteira_id
    and fe.status = 'aguardando'
    and not exists (select 1 from bloqueios_contato b where b.devedor_id = fe.devedor_id)
  group by 1;
$$;
revoke all on function fn_fila_por_faixa(bigint) from public, anon, authenticated;

-- A seleção do lote passa a respeitar a faixa escolhida. Igual à versão de 26/10/2026, mais uma
-- linha na condição da carteira.
create or replace function fn_selecionar_lote(p_chip_id integer, p_n integer)
returns setof fila_envios
language sql
set search_path = public
as $function$
  update fila_envios
  set status = 'processando', chip_id = p_chip_id, processando_desde = now()
  where id in (
    select fe.id from fila_envios fe
    where fe.status = 'aguardando'
      and (fe.agendado_para is null or fe.agendado_para <= now())
      and (fe.chip_designado_id = p_chip_id or fe.chip_designado_id is null)
      -- chip com abordagem travada não INICIA conversa (continua respondendo pelo bot-turno)
      and not exists (
        select 1 from chips c3
        where c3.id = p_chip_id and c3.abordagem_travada_ate is not null
          and c3.abordagem_travada_ate > now()
      )
      -- ADR-0003: quem pediu para parar não recebe abordagem de nenhum chip, nunca mais
      and not exists (
        select 1 from bloqueios_contato b where b.devedor_id = fe.devedor_id
      )
      -- carteira ativa E este chip vinculado a ela E o devedor no público escolhido (16/11/2026)
      and exists (
        select 1 from devedores d
        join carteiras c on c.id = d.carteira_id
        join carteira_chips cc on cc.carteira_id = c.id and cc.chip_id = p_chip_id
        where d.id = fe.devedor_id and c.status = 'ativa'
          and (c.publico_faixa is null or fn_faixa_atraso(d.vencimento) = c.publico_faixa)
      )
    order by (fe.chip_designado_id = p_chip_id) desc nulls last,
      -- a ordem que o dono escolheu para a carteira (V5.5.20); sem vencimento vai para o fim
      (select case when c.ordem_fila = 'antigos' then d.vencimento end
         from devedores d join carteiras c on c.id = d.carteira_id where d.id = fe.devedor_id) asc nulls last,
      (select case when c.ordem_fila = 'recentes' then d.vencimento end
         from devedores d join carteiras c on c.id = d.carteira_id where d.id = fe.devedor_id) desc nulls last,
      fe.prioridade desc, fe.id
    limit p_n
    for update skip locked
  )
  returning *;
$function$;
