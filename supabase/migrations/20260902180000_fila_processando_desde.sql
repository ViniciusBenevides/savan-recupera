-- A fila reabordava a mesma pessoa de hora em hora, para sempre.
--
-- Aplicar com:  bash scripts/supabase-sql.sh supabase/migrations/20260902180000_fila_processando_desde.sql
--
-- ── O que acontecia ─────────────────────────────────────────────────────────────────────────
-- `fn_selecionar_lote` marca o item como `processando` ao reivindicá-lo, justamente para que a
-- rodada seguinte não o pegue de novo. Só que `fn_resetar_presos`, chamado no INÍCIO de toda
-- rodada do `campanha-lote`, media a idade do item assim:
--
--     where status = 'processando' and criado_em < now() - (p_min || ' minutes')::interval
--
-- `criado_em` é quando a LINHA DA FILA foi criada — na importação da carteira —, não quando o item
-- foi reivindicado. As linhas desta base são de 24/06/2026: a condição era verdadeira para os 2041
-- itens, sempre. Na prática o `processando` nunca protegeu nada.
--
-- Enquanto o `campanha-registrar` confirmava o envio (item → `enviado`), o defeito ficava
-- invisível. Quando a confirmação falhava, o item voltava para `aguardando` na rodada seguinte e
-- era disparado outra vez — e o `contato-criar` abre uma conversa NOVA no Chatwoot a cada disparo.
--
-- Em 02/09/2026 isso atingiu a devedora 570: 5 aberturas frias entre 13:24 e 17:49, uma por hora,
-- cada uma numa conversa nova, com a fila inteira congelada atrás dela (ninguém mais foi abordado
-- em 5 horas). Reabordagem repetida da mesma pessoa é exatamente o que derruba chip.
--
-- ── A correção ─────────────────────────────────────────────────────────────────────────────
-- Um carimbo próprio para a reivindicação, mais um teto de tentativas: se um item voltou à fila
-- vezes demais sem confirmação, ele PARA. Cada volta é uma nova mensagem para uma pessoa real —
-- reabrir para sempre é o pior desfecho possível.

alter table fila_envios add column if not exists processando_desde timestamptz;

comment on column fila_envios.processando_desde is
  'Quando o item foi reivindicado por fn_selecionar_lote. É a idade que fn_resetar_presos deve '
  'medir — `criado_em` é a criação da linha na importação e não diz nada sobre o envio em curso.';

-- ── fn_selecionar_lote: carimba a reivindicação ─────────────────────────────────────────────
-- Idêntica à anterior, com `processando_desde = now()` junto do `status = 'processando'`.
create or replace function public.fn_selecionar_lote(p_chip_id integer, p_n integer)
returns setof fila_envios
language sql
set search_path to 'public'
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

-- ── fn_resetar_presos: mede a idade certa e desiste depois de tentar demais ─────────────────
-- Assinatura preservada (1 argumento) de propósito: `campanha-lote` chama
-- `rpc("fn_resetar_presos", { p_min: 15 })`. Criar uma sobrecarga de 2 argumentos com default
-- deixaria a chamada de 1 argumento ambígua e quebraria a rodada.
create or replace function public.fn_resetar_presos(p_min integer default 15)
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_n int;
  -- Quantas vezes um item pode voltar para a fila sem que o envio seja confirmado. Cada volta é
  -- uma NOVA abordagem para uma pessoa real; 3 já é generoso.
  c_max_tentativas constant int := 3;
begin
  -- 0) A mensagem SAIU? Reabrir um item só é correto quando o envio não aconteceu. Se o devedor
  --    recebeu mensagem de saída depois da reivindicação, a abordagem aconteceu e só a confirmação
  --    se perdeu — devolver à fila mandaria a mesma abertura fria outra vez. Foi exatamente assim
  --    que a devedora 570 recebeu 5 aberturas em 5 horas em 02/09/2026.
  --
  --    A prova vem de `mensagens`: além do `campanha-registrar`, o `chatwoot-sync` espelha toda
  --    saída que passa pelo Chatwoot. Então a mensagem aparece aqui mesmo quando a confirmação
  --    falhou — é justamente o caso que este bloco resolve.
  update fila_envios f
  set status = 'enviado',
      enviado_em = coalesce(f.enviado_em, now()),
      chip_id = null,
      erro = coalesce(f.erro, 'envio comprovado pela mensagem registrada; campanha-registrar nao confirmou')
  where f.status = 'processando'
    and coalesce(f.processando_desde, f.criado_em) < now() - (p_min || ' minutes')::interval
    and exists (
      select 1
      from mensagens m
      join conversas c on c.id = m.conversa_id
      where c.devedor_id = f.devedor_id
        and c.simulacao is not true
        and m.simulacao is not true
        and m.direcao = 'saida'
        and m.criado_em >= coalesce(f.processando_desde, now() - (p_min || ' minutes')::interval)
    );

  -- 1) Quem já voltou vezes demais para de voltar. Sai como `falha` para aparecer no painel em
  --    vez de sumir em silêncio — é um envio que saiu e nunca foi confirmado, precisa de olho
  --    humano, não de mais uma tentativa.
  update fila_envios
  set status = 'falha', chip_id = null,
      erro = coalesce(
        erro,
        'reaberto ' || tentativas || 'x sem confirmacao do campanha-registrar; parado para nao reabordar'
      )
  where status = 'processando'
    and coalesce(processando_desde, criado_em) < now() - (p_min || ' minutes')::interval
    and tentativas >= c_max_tentativas;

  -- 2) O resto volta para a fila, contando a tentativa. `coalesce(processando_desde, criado_em)`
  --    cobre as linhas reivindicadas antes desta migração; daqui para frente o carimbo existe.
  with reabertos as (
    update fila_envios
    set status = 'aguardando', chip_id = null, processando_desde = null,
        tentativas = tentativas + 1
    where status = 'processando'
      and coalesce(processando_desde, criado_em) < now() - (p_min || ' minutes')::interval
    returning 1
  )
  select count(*) into v_n from reabertos;
  return v_n;
end;
$function$;
