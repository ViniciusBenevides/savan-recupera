-- SAVAN Recupera — 015: failover de chip (reatribuição com herança de contexto)
-- fn_failover_resumo: o que está "preso" num chip (para o banner/alerta).
-- fn_reatribuir_chip: move a fila e as conversas de um chip caído para um chip destino.

create or replace function fn_failover_resumo(p_chip_id int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'aguardando', (select count(*) from fila_envios where chip_designado_id = p_chip_id and status = 'aguardando'),
    'conversas_ativas', (select count(*) from conversas where chip_id = p_chip_id and estado in ('bot_ativo','aguardando_resposta','pix_enviado')),
    'escaladas', (select count(*) from conversas where chip_id = p_chip_id and estado = 'humano')
  );
$$;

revoke execute on function fn_failover_resumo(int) from public, anon, authenticated;

-- Reatribui tudo de um chip caído para o destino (NULL = pool livre). Executada SÓ na
-- confirmação do operador. Conversas escaladas continuam com humano (não voltam ao bot);
-- a herança de contexto vem do histórico por devedor que o bot-turno passou a carregar.
create or replace function fn_reatribuir_chip(p_chip_caido int, p_chip_destino int)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_presos int; v_fila int; v_conv int; v_esc int;
begin
  -- 1) reabre itens presos em 'processando' do chip caído
  update fila_envios set status = 'aguardando', chip_id = null
  where chip_id = p_chip_caido and status = 'processando';
  get diagnostics v_presos = row_count;

  -- 2) re-designa a fila aguardando do chip caído para o destino (ou pool se null)
  update fila_envios set chip_designado_id = p_chip_destino
  where chip_designado_id = p_chip_caido and status = 'aguardando';
  get diagnostics v_fila = row_count;

  -- 3) conversas em andamento (bot) → destino
  update conversas set chip_id = p_chip_destino
  where chip_id = p_chip_caido and estado in ('bot_ativo','aguardando_resposta','pix_enviado');
  get diagnostics v_conv = row_count;

  -- 4) escaladas (humano): mantêm o estado 'humano', só apontam o novo chip e o ledger registra
  update conversas set chip_id = p_chip_destino
  where chip_id = p_chip_caido and estado = 'humano';
  update escalacoes set chip_id = p_chip_destino
  where chip_id = p_chip_caido and status in ('aberta','em_atendimento');
  get diagnostics v_esc = row_count;

  return jsonb_build_object(
    'presos_reabertos', v_presos, 'fila_reatribuida', v_fila,
    'conversas_movidas', v_conv, 'escaladas_movidas', v_esc
  );
end;
$$;

revoke execute on function fn_reatribuir_chip(int, int) from public, anon, authenticated;
