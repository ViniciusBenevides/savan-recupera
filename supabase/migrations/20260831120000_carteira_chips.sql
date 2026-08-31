-- Quais chips atendem quais carteiras.
--
-- Até aqui a relação não existia. O `fn_selecionar_lote` deixava qualquer chip ativo puxar item de
-- qualquer carteira ativa — nem por cobrador filtrava — e o `fn_distribuir_carteira` carimbava o
-- `chip_designado_id` escolhendo entre TODOS os chips do banco. Com um número só e um cobrador só
-- isso passava despercebido; com vários números Baileys e rotatividade alta (ADR-0004) vira o
-- contrário do que se quer: o chip de uma carteira abrindo conversa da carteira de outro.
--
-- A relação é N:N de propósito. Uma carteira grande precisa de vários números para diluir o volume,
-- e um número serve mais de uma carteira quando o volume é pequeno — obrigar 1:N em qualquer das
-- duas direções quebraria um dos dois casos.
--
-- Idempotente: pode rodar duas vezes seguidas.

-- 1) A tabela -------------------------------------------------------------------------------
create table if not exists carteira_chips (
  carteira_id bigint not null references carteiras (id) on delete cascade,
  chip_id     int    not null references chips (id)     on delete cascade,
  criado_em   timestamptz not null default now(),
  primary key (carteira_id, chip_id)
);

comment on table carteira_chips is
  'Quais chips podem abrir conversa por qual carteira. Sem vínculo o chip não recebe item nenhum '
  'daquela carteira — nem pelo pool livre, nem por designação.';

-- A PK já cobre a busca por carteira; esta cobre o caminho inverso, que é o do `fn_selecionar_lote`
-- ("de quais carteiras este chip pode puxar?") e roda a cada minuto no W01.
create index if not exists idx_carteira_chips_chip on carteira_chips (chip_id);

-- 2) Backfill — preserva o alcance de hoje, só que explícito -------------------------------
-- Todo chip de bot passa a atender as carteiras do mesmo dono. É o comportamento que a operação
-- tinha na prática (um cobrador, seus chips, suas carteiras), agora escrito em vez de implícito.
-- Chip papel='equipe' fica de fora: é número de escalação humana, não dispara campanha.
insert into carteira_chips (carteira_id, chip_id)
select c.id, ch.id
from carteiras c
join chips ch on ch.cobrador_id = c.cobrador_id
where coalesce(ch.papel, 'bot') = 'bot'
  and c.cobrador_id is not null
on conflict do nothing;

-- 3) RLS -------------------------------------------------------------------------------------
alter table carteira_chips enable row level security;

drop policy if exists sel_carteira_chips on carteira_chips;
create policy sel_carteira_chips on carteira_chips for select to authenticated
  using (fn_role() = 'admin' or carteira_id in (select fn_carteiras_visiveis()));

-- Vincular é decisão de quem é dono da carteira E do chip: ligar um chip alheio à própria carteira
-- faria o número de outro cobrador abrir conversa em nome desta operação.
drop policy if exists ins_carteira_chips on carteira_chips;
create policy ins_carteira_chips on carteira_chips for insert to authenticated
  with check (
    fn_role() = 'admin'
    or (fn_role() = 'cobrador'
        and carteira_id in (select fn_carteiras_visiveis())
        and chip_id in (select fn_chips_visiveis()))
  );

drop policy if exists del_carteira_chips on carteira_chips;
create policy del_carteira_chips on carteira_chips for delete to authenticated
  using (
    fn_role() = 'admin'
    or (fn_role() = 'cobrador' and carteira_id in (select fn_carteiras_visiveis()))
  );

-- 4) fn_selecionar_lote passa a exigir o vínculo ---------------------------------------------
-- Mesma assinatura e mesmo contrato de antes; muda só o `exists` da carteira, que agora entra pela
-- carteira_chips. Sem vínculo o chip volta lote vazio — que é o certo: melhor não disparar do que
-- disparar pelo número errado.
create or replace function fn_selecionar_lote(p_chip_id integer, p_n integer)
returns setof fila_envios
language sql
set search_path = public
as $function$
  update fila_envios
  set status = 'processando', chip_id = p_chip_id
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
      -- carteira ativa E este chip vinculado a ela
      and exists (
        select 1 from devedores d
        join carteiras c on c.id = d.carteira_id
        join carteira_chips cc on cc.carteira_id = c.id and cc.chip_id = p_chip_id
        where d.id = fe.devedor_id and c.status = 'ativa'
      )
    order by (fe.chip_designado_id = p_chip_id) desc nulls last, fe.prioridade desc, fe.id
    limit p_n
    for update skip locked
  )
  returning *;
$function$;

-- 5) fn_distribuir_carteira só distribui entre os chips daquela carteira ----------------------
-- Mesmas quatro estratégias de antes. Duas mudanças, ambas de escopo:
--   a) só entram chips vinculados à carteira que está sendo distribuída;
--   b) só entram chips papel='bot' — o número de escalação humana nunca dispara, e designar item
--      para ele criava fila parada, porque o `campanha-lote` nem olha para chip 'cadastrado'.
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
      select c.id, (row_number() over (order by c.id)) - 1 as idx
      from chips c
      join carteira_chips cc on cc.chip_id = c.id and cc.carteira_id = p_carteira_id
      where c.status in ('cadastrado','conectado','aquecendo','ativo')
        and coalesce(c.papel, 'bot') = 'bot'
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
    join carteira_chips cc on cc.chip_id = c.id
    where f.devedor_id = d.id
      and cc.carteira_id = p_carteira_id
      and f.carteira_id = p_carteira_id and f.status = 'aguardando'
      and c.status in ('cadastrado','conectado','aquecendo','ativo')
      and coalesce(c.papel, 'bot') = 'bot'
      and c.regiao_uf is not null
      and d.uf = any(c.regiao_uf);

    if p_estrategia = 'manual' then
      update fila_envios f
      set chip_designado_id = c.id
      from devedores d, chips c
      join carteira_chips cc on cc.chip_id = c.id
      where f.devedor_id = d.id
        and cc.carteira_id = p_carteira_id
        and f.carteira_id = p_carteira_id and f.status = 'aguardando'
        and f.chip_designado_id is null
        and c.status in ('cadastrado','conectado','aquecendo','ativo')
        and coalesce(c.papel, 'bot') = 'bot'
        and c.regiao_cidade is not null
        and d.cidade = any(c.regiao_cidade);
    end if;

  elsif p_estrategia = 'cidade' then
    update fila_envios f
    set chip_designado_id = c.id
    from devedores d, chips c
    join carteira_chips cc on cc.chip_id = c.id
    where f.devedor_id = d.id
      and cc.carteira_id = p_carteira_id
      and f.carteira_id = p_carteira_id and f.status = 'aguardando'
      and c.status in ('cadastrado','conectado','aquecendo','ativo')
      and coalesce(c.papel, 'bot') = 'bot'
      and c.regiao_cidade is not null
      and d.cidade = any(c.regiao_cidade);
  end if;

  select count(*) into v_total from fila_envios
  where carteira_id = p_carteira_id and status = 'aguardando' and chip_designado_id is not null;
  return v_total;
end;
$$;

revoke execute on function fn_distribuir_carteira(bigint, text) from public, anon, authenticated;
