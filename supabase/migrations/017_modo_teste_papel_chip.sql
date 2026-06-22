-- 017 — Modo teste de verdade + papel de chip (bot x equipe) + número de teste
-- Objetivos:
--  #1 separar real x teste: flag `simulacao` carimbada nas tabelas operacionais
--  #2 escalação: chip tem papel (bot dispara/negocia; equipe = cobrador humano) + roteamento
--  modo teste: número de teste fica na área de Chips; métricas REAIS nunca contam teste

-- ───────────────────────── #1 flags de simulação ─────────────────────────
alter table fila_envios add column if not exists simulacao boolean not null default false;
alter table conversas   add column if not exists simulacao boolean not null default false;
alter table mensagens   add column if not exists simulacao boolean not null default false;
alter table negociacoes add column if not exists simulacao boolean not null default false;
alter table pagamentos  add column if not exists simulacao boolean not null default false;

create index if not exists idx_conversas_simulacao  on conversas(simulacao);
create index if not exists idx_pagamentos_simulacao on pagamentos(simulacao);
create index if not exists idx_negociacoes_simulacao on negociacoes(simulacao);

-- ───────────────────────── #2 papel do chip ─────────────────────────
alter table chips add column if not exists papel text not null default 'bot'
  check (papel in ('bot','equipe'));
comment on column chips.papel is
  'bot = chip do robô (dispara/negocia); equipe = chip de um cobrador humano (recebe escalações)';
-- nome do cobrador dono do chip da equipe (transparência ao escalar)
alter table chips add column if not exists agente_nome text;

-- roteamento/transparência da escalação
alter table escalacoes add column if not exists equipe_chip_id integer references chips(id);
alter table escalacoes add column if not exists atendente_numero text;
alter table escalacoes add column if not exists resumo text;

-- ───────────────────────── número de teste (área de Chips) ─────────────────────────
insert into configuracoes (chave, valor, descricao)
values ('numero_teste',
        '{"e164": "", "ativo": false}'::jsonb,
        'Número que recebe as mensagens quando o modo teste está ligado (definido na tela de Chips).')
on conflict (chave) do nothing;

-- ───────────────────────── trigger: pagamento de teste não suja métricas reais ─────────────────────────
create or replace function public.fn_pagamento_confirmado()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.status in ('recebido','confirmado') and old.status is distinct from new.status
     and old.status not in ('recebido','confirmado') then
    new.pago_em := coalesce(new.pago_em, now());

    if new.negociacao_id is not null then
      update negociacoes set status = 'paga' where id = new.negociacao_id;
    end if;
    update devedores set status_cobranca = 'pago' where id = new.devedor_id;
    update conversas set estado = 'pago', proximo_followup_em = null
      where devedor_id = new.devedor_id and estado <> 'encerrada';

    update escalacoes
    set status = 'fechada_paga', pagamento_id = new.id, fechado_em = now()
    where devedor_id = new.devedor_id and status in ('aberta','em_atendimento');

    insert into eventos_campanha (tipo, devedor_id, payload)
    values ('pagamento', new.devedor_id,
            jsonb_build_object('pagamento_id', new.id, 'valor', new.valor,
                               'comissao', new.comissao_operador,
                               'simulacao', coalesce(new.simulacao, false)));

    -- métricas REAIS: nunca contam pagamento de teste
    if not coalesce(new.simulacao, false) then
      insert into metricas_diarias (dia, pagamentos, valor_recuperado, comissao)
      values (current_date, 1, new.valor, coalesce(new.comissao_operador, 0))
      on conflict (dia) do update set
        pagamentos = metricas_diarias.pagamentos + 1,
        valor_recuperado = metricas_diarias.valor_recuperado + excluded.valor_recuperado,
        comissao = metricas_diarias.comissao + excluded.comissao,
        atualizado_em = now();
    end if;
  end if;
  return new;
end;
$function$;
