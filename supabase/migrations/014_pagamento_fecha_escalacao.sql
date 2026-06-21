-- SAVAN Recupera — 014: pagamento confirmado fecha escalação aberta (transparência)
-- Ao confirmar um pagamento, se o devedor tinha uma escalação aberta/em atendimento,
-- ela é marcada como 'fechada_paga' e vinculada ao pagamento. Assim todo caso escalado
-- tem desfecho rastreável e nenhum acordo "some".

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

    -- fecha escalação aberta do devedor, vinculando o pagamento
    update escalacoes
    set status = 'fechada_paga', pagamento_id = new.id, fechado_em = now()
    where devedor_id = new.devedor_id and status in ('aberta','em_atendimento');

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

revoke execute on function fn_pagamento_confirmado() from public, anon, authenticated;
