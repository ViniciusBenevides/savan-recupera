-- SAVAN Recupera — 026: ritmo seguro por hora + trava de abordagem (§33)
--
-- Motivação: até aqui o único freio era o teto DIÁRIO (fn_limite_chip) e o intervalo sorteado entre
-- mensagens. Nada impedia um chip gastar a cota inteira do dia numa rajada curta — que é o padrão que
-- o WhatsApp lê como robô (ver §31: 2 chips restringidos com 3 envios). O benchmark do cnpj.biz (§33)
-- mostra o controle que falta: teto por HORA, além do teto por dia.
--
-- Também entra a "trava de abordagem": chip que apanhou (ou caiu para qualidade RED) para de INICIAR
-- conversa, mas continua RESPONDENDO quem respondeu. Hoje só existe o tudo-ou-nada (ativo/pausado).
--
-- Idempotente. Não altera fn_limite_chip nem fn_inc_chip_metrica (migrations 005–007 não estão no
-- repo — as funções vivem só no banco; aqui só se ACRESCENTA).

-- ---------------------------------------------------------------- 1) colunas novas em chips
alter table chips add column if not exists limite_hora_override int;
alter table chips add column if not exists abordagem_travada_ate timestamptz;

comment on column chips.limite_hora_override is
  'Teto manual de mensagens por hora. Precedência absoluta sobre a curva de ritmo (config "ritmo").';
comment on column chips.abordagem_travada_ate is
  'Enquanto > now(), o chip não INICIA conversa (fn_selecionar_lote o ignora). Responder continua valendo.';

-- ---------------------------------------------------------------- 2) contador por hora
-- Serve a dois propósitos: orçamento de ritmo (campanha-lote) e heatmap hora × dia (relatórios).
create table if not exists chip_metricas_horarias (
  chip_id   int      not null references chips (id) on delete cascade,
  dia       date     not null,
  hora      smallint not null check (hora between 0 and 23),
  msgs      int      not null default 0,
  respostas int      not null default 0,
  primary key (chip_id, dia, hora)
);

create index if not exists idx_chip_metricas_horarias_dia on chip_metricas_horarias (dia, hora);

alter table chip_metricas_horarias enable row level security;

-- mesmo escopo por tenant de chip_metricas_diarias (migration 020): admin vê tudo, cobrador vê os seus
drop policy if exists sel_chip_metricas_horarias on chip_metricas_horarias;
create policy sel_chip_metricas_horarias on chip_metricas_horarias
  for select to authenticated
  using (fn_role() = 'admin'::papel_usuario or chip_id in (select fn_chips_visiveis()));

-- escrita só pelo service_role (padrão do hardening da §29)
revoke insert, update, delete on chip_metricas_horarias from authenticated, anon;

-- ---------------------------------------------------------------- 3) incremento horário
create or replace function fn_inc_chip_metrica_hora(
  p_chip int, p_dia date, p_hora smallint, p_msgs int, p_resp int)
returns void
language sql
set search_path = public
as $$
  insert into chip_metricas_horarias (chip_id, dia, hora, msgs, respostas)
  values (p_chip, p_dia, p_hora, p_msgs, p_resp)
  on conflict (chip_id, dia, hora) do update set
    msgs      = chip_metricas_horarias.msgs      + p_msgs,
    respostas = chip_metricas_horarias.respostas + p_resp;
$$;

revoke execute on function fn_inc_chip_metrica_hora(int, date, smallint, int, int) from public, anon;

-- ---------------------------------------------------------------- 4) teto por hora do chip
-- Precedência espelhando fn_limite_chip (011): override manual > curva da maturidade > derivado do dia.
-- O derivado existe para que um chip nunca fique SEM teto horário: dilui o teto diário pelas horas da
-- janela, que é exatamente o comportamento "não queime a cota numa rajada".
create or replace function fn_limite_chip_hora(p_chip_id int)
returns int
language plpgsql
stable
set search_path = public
as $$
declare
  v_chip   chips%rowtype;
  v_ritmo  jsonb;
  v_janela jsonb;
  v_horas  numeric;
  v_dia    int;
  v_lim    int;
begin
  select * into v_chip from chips where id = p_chip_id;
  if not found then return 0; end if;

  -- 1) manual
  if v_chip.limite_hora_override is not null then return v_chip.limite_hora_override; end if;

  -- 2) curva de ritmo por maturidade (config global "ritmo")
  select valor into v_ritmo from configuracoes where chave = 'ritmo' and cobrador_id is null;
  if v_ritmo is not null then
    v_lim := (v_ritmo -> coalesce(v_chip.maturidade, 'novo') ->> 'msgs_hora')::int;
    if v_lim is not null and v_lim > 0 then return v_lim; end if;
  end if;

  -- 3) derivado: teto do dia diluído pelas horas da janela de envio
  v_dia := coalesce(fn_limite_chip(p_chip_id), 0);
  if v_dia <= 0 then return 0; end if;
  select valor into v_janela from configuracoes where chave = 'janela_envio' and cobrador_id is null;
  v_horas := greatest(1, extract(hour from
      (coalesce(v_janela ->> 'fim', '20:00') || ':00')::time
    - (coalesce(v_janela ->> 'inicio', '08:00') || ':00')::time));
  return greatest(1, ceil(v_dia / v_horas)::int);
end;
$$;

revoke execute on function fn_limite_chip_hora(int) from public, anon;

-- ---------------------------------------------------------------- 5) fn_selecionar_lote respeita a trava
-- Idêntica à versão em produção, mais o gate de abordagem travada. Continua com FOR UPDATE SKIP LOCKED.
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
      -- chip com abordagem travada não INICIA conversa (continua respondendo pelo bot-turno)
      and not exists (
        select 1 from chips c3
        where c3.id = p_chip_id and c3.abordagem_travada_ate is not null
          and c3.abordagem_travada_ate > now()
      )
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

-- ---------------------------------------------------------------- 6) seed do ritmo (conservador)
-- Calibrado pelo benchmark do §33 (cnpj.biz alerta acima de 20-30 msg/h; as conexões reais deles
-- rodam a 5,5-10 msg/h). Só insere se ainda não existir — não clobra ajuste manual do dono.
insert into configuracoes (chave, valor, descricao)
select 'ritmo',
       '{"novo": {"msgs_hora": 8}, "aquecido": {"msgs_hora": 25},
         "pausar_em_red": true, "trava_red_horas": 72}'::jsonb,
       'Teto de mensagens por hora por maturidade de chip + auto-trava quando a qualidade Meta cai para RED'
where not exists (select 1 from configuracoes where chave = 'ritmo' and cobrador_id is null);
