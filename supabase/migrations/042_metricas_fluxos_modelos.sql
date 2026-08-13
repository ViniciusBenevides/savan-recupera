-- Agregados sem multiplicacao de linhas e com contagem por modelo Meta usado.

create or replace view public.v_desempenho_fluxos
with (security_invoker = true)
as
with envios as (
  select
    fluxo_versao_id,
    sum(quantidade)::bigint as envios,
    coalesce(jsonb_agg(modelo order by quantidade desc), '[]'::jsonb) as modelos
  from (
    select
      fluxo_versao_id,
      jsonb_build_object(
        'nome', coalesce(meta_template_name, 'historico_sem_atribuicao'),
        'idioma', meta_template_language,
        'quantidade', count(*)
      ) as modelo,
      count(*) as quantidade
    from public.fila_envios
    where status = 'enviado' and coalesce(simulacao, false) = false
    group by fluxo_versao_id, meta_template_name, meta_template_language
  ) agrupados
  group by fluxo_versao_id
), conversas_ag as (
  select
    cv.fluxo_versao_id,
    count(*) filter (
      where coalesce(cv.simulacao, false) = false and exists (
        select 1 from public.mensagens m
        where m.conversa_id = cv.id and m.direcao = 'entrada'
      )
    ) as responderam,
    count(*) filter (
      where cv.motivo_encerramento = 'pessoa_errada'
        and coalesce(cv.simulacao, false) = false
    ) as pessoas_erradas
  from public.conversas cv
  group by cv.fluxo_versao_id
), pagamentos_ag as (
  select
    cv.fluxo_versao_id,
    count(distinct p.id) as pagamentos,
    coalesce(sum(p.valor), 0) as valor_recuperado
  from public.conversas cv
  join public.negociacoes n on n.conversa_id = cv.id
  join public.pagamentos p on p.negociacao_id = n.id
    and p.status in ('recebido', 'confirmado')
    and coalesce(p.simulacao, false) = false
  group by cv.fluxo_versao_id
)
select
  fv.id as fluxo_versao_id,
  fv.carteira_id,
  fv.versao,
  fv.nome,
  fv.criado_em,
  coalesce(e.envios, 0::bigint) as envios,
  coalesce(c.responderam, 0) as responderam,
  coalesce(c.pessoas_erradas, 0) as pessoas_erradas,
  coalesce(p.pagamentos, 0) as pagamentos,
  coalesce(p.valor_recuperado, 0) as valor_recuperado,
  coalesce(e.modelos, '[]'::jsonb) as modelos
from public.fluxo_versoes fv
left join envios e on e.fluxo_versao_id = fv.id
left join conversas_ag c on c.fluxo_versao_id = fv.id
left join pagamentos_ag p on p.fluxo_versao_id = fv.id;

grant select on public.v_desempenho_fluxos to authenticated;
