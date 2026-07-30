-- SAVAN Recupera — 027: taxa de resposta por hora, por chip e por template (§33)
--
-- Até aqui as métricas respondiam "quantos enviei", nunca "o que funcionou". Sem isso não dá para
-- responder as duas perguntas que o dono faz: qual a melhor hora para abordar, e qual modelo de
-- mensagem converte. Os dados já existiam — `fila_envios.template_id` é gravado pelo campanha-lote
-- desde sempre, e agora `chip_metricas_horarias` (026) guarda envio e resposta por hora.
--
-- São VIEWS: não duplicam dado, então não há o que sair de sincronia.

-- ---------------------------------------------------------------- 1) heatmap hora × dia da semana
-- "Que horas vale abordar?" — taxa de resposta agregada por dia da semana e hora do dia.
create or replace view v_resposta_por_hora as
select
  extract(dow  from m.dia)::int            as dia_semana,   -- 0=dom … 6=sáb
  m.hora                                   as hora,
  sum(m.msgs)::int                         as enviadas,
  sum(m.respostas)::int                    as respostas,
  case when sum(m.msgs) > 0
       then round(100.0 * sum(m.respostas) / sum(m.msgs), 1)
       else 0 end                          as taxa_resposta_pct
from chip_metricas_horarias m
group by 1, 2;

-- ---------------------------------------------------------------- 2) desempenho por template
-- "Qual abordagem funciona?" — uma conversa conta como resposta quando tem mensagem de ENTRADA.
create or replace view v_resposta_por_template as
select
  t.id                                     as template_id,
  t.nome                                   as template,
  t.tipo                                   as tipo,
  count(distinct f.id)                     as enviadas,
  count(distinct c.id) filter (
    where exists (
      select 1 from mensagens mg
      where mg.conversa_id = c.id and mg.direcao = 'entrada'
    )
  )                                        as responderam,
  count(distinct p.id) filter (where p.status in ('recebido', 'confirmado')) as pagaram
from templates_mensagem t
join fila_envios f on f.template_id = t.id and f.status = 'enviado' and coalesce(f.simulacao, false) = false
left join conversas c on c.devedor_id = f.devedor_id and coalesce(c.simulacao, false) = false
left join pagamentos p on p.devedor_id = f.devedor_id and coalesce(p.simulacao, false) = false
group by t.id, t.nome, t.tipo;

-- ---------------------------------------------------------------- 3) grants
-- Leitura para o painel; as views herdam o RLS das tabelas-base (security_invoker).
alter view v_resposta_por_hora     set (security_invoker = true);
alter view v_resposta_por_template set (security_invoker = true);

grant select on v_resposta_por_hora     to authenticated;
grant select on v_resposta_por_template to authenticated;
