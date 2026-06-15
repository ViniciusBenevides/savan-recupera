-- SAVAN Recupera — 002: funções, triggers e views

-- Papel do usuário logado (para policies RLS)
create or replace function fn_role()
returns papel_usuario
language sql stable security definer
set search_path = public
as $$
  select role from usuarios_app where id = auth.uid()
$$;

-- Limite diário de novos contatos do chip conforme aquecimento
create or replace function fn_limite_chip(p_chip_id int)
returns int
language plpgsql stable
set search_path = public
as $$
declare
  v_chip chips%rowtype;
  v_aq jsonb;
  v_dia int;
  v_lim int := 0;
  f jsonb;
begin
  select * into v_chip from chips where id = p_chip_id;
  if not found then return 0; end if;
  if v_chip.limite_dia_override is not null then return v_chip.limite_dia_override; end if;
  if v_chip.data_ativacao is null then return 0; end if;
  v_dia := (current_date - v_chip.data_ativacao) + 1;
  select valor into v_aq from configuracoes where chave = 'aquecimento';
  if v_aq is null then return 0; end if;
  for f in select * from jsonb_array_elements(v_aq) loop
    if v_dia >= (f->>'de')::int and v_dia <= (f->>'ate')::int then
      v_lim := (f->>'limite')::int;
    end if;
  end loop;
  return v_lim;
end;
$$;

-- Seleção atômica de lote da fila (à prova de concorrência)
create or replace function fn_selecionar_lote(p_chip_id int, p_n int)
returns setof fila_envios
language sql
set search_path = public
as $$
  update fila_envios
  set status = 'processando', chip_id = p_chip_id
  where id in (
    select id from fila_envios
    where status = 'aguardando'
      and (agendado_para is null or agendado_para <= now())
    order by prioridade desc, id
    limit p_n
    for update skip locked
  )
  returning *;
$$;

-- Proposta de quitação: o LLM nunca faz aritmética — só usa este retorno
create or replace function fn_proposta(p_devedor_id bigint)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_dev devedores%rowtype;
  v_cfg jsonb;
  v_idade numeric;
  v_pct numeric := 0;
  v_faixa text := null;
  v_min numeric := 30;
  v_validade_dias int := 7;
  v_valor_final numeric;
  f jsonb;
begin
  select * into v_dev from devedores where id = p_devedor_id;
  if not found then
    return jsonb_build_object('erro', 'devedor_nao_encontrado');
  end if;

  select valor into v_cfg from configuracoes where chave = 'faixas_desconto';
  v_min := coalesce((v_cfg->>'valor_minimo_pix')::numeric, 30);
  v_validade_dias := coalesce(
    (select (valor)::text::int from configuracoes where chave = 'validade_proposta_dias'), 7);

  v_idade := coalesce(extract(year from age(current_date, v_dev.vencimento)), 99);

  for f in select * from jsonb_array_elements(coalesce(v_cfg->'faixas', '[]'::jsonb)) loop
    if v_idade >= (f->>'idade_min')::numeric and (f->>'pct')::numeric > v_pct then
      v_pct := (f->>'pct')::numeric;
      v_faixa := format('%s+ anos: %s%%', f->>'idade_min', f->>'pct');
    end if;
  end loop;

  v_valor_final := round(v_dev.saldo * (1 - v_pct / 100.0), 2);
  if v_valor_final < v_min then
    v_valor_final := least(v_dev.saldo, v_min);
  end if;

  return jsonb_build_object(
    'devedor_id', v_dev.id,
    'nome', v_dev.nome,
    'primeiro_nome', initcap(split_part(v_dev.nome, ' ', 1)),
    'ano_divida', extract(year from v_dev.vencimento),
    'idade_anos', v_idade,
    'valor_original', v_dev.saldo,
    'desconto_pct', v_pct,
    'faixa_aplicada', v_faixa,
    'valor_final', v_valor_final,
    'valido_ate', to_char(current_date + v_validade_dias, 'DD/MM/YYYY'),
    'margem_extra_pp', coalesce((v_cfg->>'margem_extra_pp')::numeric, 0)
  );
end;
$$;

-- Touch de atualizado_em
create or replace function fn_touch_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger trg_touch_devedores before update on devedores for each row execute function fn_touch_atualizado_em();
create trigger trg_touch_chips before update on chips for each row execute function fn_touch_atualizado_em();
create trigger trg_touch_conversas before update on conversas for each row execute function fn_touch_atualizado_em();
create trigger trg_touch_negociacoes before update on negociacoes for each row execute function fn_touch_atualizado_em();
create trigger trg_touch_pagamentos before update on pagamentos for each row execute function fn_touch_atualizado_em();
create trigger trg_touch_templates before update on templates_mensagem for each row execute function fn_touch_atualizado_em();
create trigger trg_touch_configuracoes before update on configuracoes for each row execute function fn_touch_atualizado_em();

-- Propagação de pagamento confirmado
create or replace function fn_pagamento_confirmado()
returns trigger
language plpgsql
set search_path = public
as $$
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

    insert into eventos_campanha (tipo, devedor_id, payload)
    values ('pagamento', new.devedor_id,
            jsonb_build_object('pagamento_id', new.id, 'valor', new.valor,
                               'comissao', new.comissao_operador));

    insert into metricas_diarias (dia, pagamentos, valor_recuperado, comissao)
    values (current_date, 1, new.valor, coalesce(new.comissao_operador, 0))
    on conflict (dia) do update set
      pagamentos = metricas_diarias.pagamentos + 1,
      valor_recuperado = metricas_diarias.valor_recuperado + excluded.valor_recuperado,
      comissao = metricas_diarias.comissao + excluded.comissao,
      atualizado_em = now();
  end if;
  return new;
end;
$$;

create trigger trg_pagamento_confirmado
before update on pagamentos
for each row execute function fn_pagamento_confirmado();

-- Novo usuário do Auth entra como visualizador (admin promove depois)
create or replace function fn_handle_novo_usuario()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into usuarios_app (id, nome, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    'visualizador'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_usuario_novo
after insert on auth.users
for each row execute function fn_handle_novo_usuario();

-- Funil de conversão
create or replace view v_funil
with (security_invoker = true)
as
select
  (select count(*) from devedores) as total_devedores,
  (select count(*) from devedores where status_cobranca <> 'sem_whatsapp') as alcancaveis,
  (select count(*) from devedores where status_cobranca in
    ('contatado','em_negociacao','pix_gerado','pago','recusado','nao_perturbe','contestado')) as contatados,
  (select count(distinct devedor_id) from conversas where ultima_msg_de = 'devedor'
     or estado in ('bot_ativo','humano','pix_enviado','pago')) as responderam,
  (select count(*) from devedores where status_cobranca in ('em_negociacao','pix_gerado','pago')) as negociando,
  (select count(*) from devedores where status_cobranca in ('pix_gerado','pago')) as pix_gerados,
  (select count(*) from devedores where status_cobranca = 'pago') as pagos,
  (select coalesce(sum(valor), 0) from pagamentos where status in ('recebido','confirmado')) as valor_recuperado,
  (select coalesce(sum(comissao_operador), 0) from pagamentos where status in ('recebido','confirmado')) as comissao_total,
  (select coalesce(sum(saldo), 0) from devedores) as estoque_total;
