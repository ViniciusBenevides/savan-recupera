-- Versiona cada alteracao do fluxo, atribui envios/conversas a uma versao imutavel
-- e registra a confirmacao de identidade antes de liberar dados da cobranca.

create table if not exists public.fluxo_versoes (
  id bigint generated always as identity primary key,
  carteira_id bigint not null references public.carteiras (id) on delete cascade,
  versao integer not null,
  nome text not null,
  roteiro jsonb,
  meta_abordagem_template jsonb,
  meta_abordagem_template_candidato jsonb,
  origem_versao_id bigint references public.fluxo_versoes (id) on delete set null,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (carteira_id, versao)
);

alter table public.carteiras
  add column if not exists fluxo_versao_ativa_id bigint references public.fluxo_versoes (id) on delete set null;

alter table public.fila_envios
  add column if not exists fluxo_versao_id bigint references public.fluxo_versoes (id) on delete set null,
  add column if not exists meta_template_name text,
  add column if not exists meta_template_language text;

alter table public.conversas
  add column if not exists fluxo_versao_id bigint references public.fluxo_versoes (id) on delete set null,
  add column if not exists identidade_confirmada_em timestamptz,
  add column if not exists identidade_confirmada_por text;

create index if not exists idx_fluxo_versoes_carteira
  on public.fluxo_versoes (carteira_id, versao desc);
create index if not exists idx_fila_fluxo_versao
  on public.fila_envios (fluxo_versao_id) where fluxo_versao_id is not null;
create index if not exists idx_conversas_fluxo_versao
  on public.conversas (fluxo_versao_id) where fluxo_versao_id is not null;

comment on table public.fluxo_versoes is
  'Snapshots imutaveis do fluxo. Permitem comparar resultados e restaurar uma versao anterior.';
comment on column public.conversas.identidade_confirmada_em is
  'Momento em que a pessoa confirmou explicitamente ser o titular procurado.';

-- Cria a versao inicial das carteiras existentes sem alterar o fluxo em producao.
insert into public.fluxo_versoes (
  carteira_id, versao, nome, roteiro, meta_abordagem_template, meta_abordagem_template_candidato
)
select
  c.id,
  1,
  'Fluxo inicial importado',
  c.roteiro,
  (select valor from public.configuracoes where chave = 'meta_abordagem_template' and cobrador_id is null),
  (select valor from public.configuracoes where chave = 'meta_abordagem_template_candidato' and cobrador_id is null)
from public.carteiras c
where not exists (
  select 1 from public.fluxo_versoes fv where fv.carteira_id = c.id
);

update public.carteiras c
set fluxo_versao_ativa_id = fv.id
from public.fluxo_versoes fv
where fv.carteira_id = c.id
  and fv.versao = 1
  and c.fluxo_versao_ativa_id is null;

-- Atribui o historico quando ha uma unica versao inicial conhecida.
update public.fila_envios f
set fluxo_versao_id = c.fluxo_versao_ativa_id
from public.carteiras c
where c.id = f.carteira_id and f.fluxo_versao_id is null;

update public.conversas cv
set fluxo_versao_id = c.fluxo_versao_ativa_id
from public.carteiras c
where c.id = cv.carteira_id and cv.fluxo_versao_id is null;

alter table public.fluxo_versoes enable row level security;

drop policy if exists sel_fluxo_versoes on public.fluxo_versoes;
create policy sel_fluxo_versoes on public.fluxo_versoes for select to authenticated
  using (fn_role() = 'admin' or carteira_id in (select fn_carteiras_visiveis()));

drop policy if exists ins_fluxo_versoes on public.fluxo_versoes;
create policy ins_fluxo_versoes on public.fluxo_versoes for insert to authenticated
  with check (
    fn_role() in ('admin', 'cobrador')
    and (fn_role() = 'admin' or carteira_id in (select fn_carteiras_visiveis()))
  );

grant select, insert on public.fluxo_versoes to authenticated;
grant usage, select on sequence public.fluxo_versoes_id_seq to authenticated;

-- Metricas de cada versao. Uma conversa fica presa a versao em que comecou,
-- inclusive depois que uma versao nova e ativada.
create or replace view public.v_desempenho_fluxos
with (security_invoker = true)
as
select
  fv.id as fluxo_versao_id,
  fv.carteira_id,
  fv.versao,
  fv.nome,
  fv.criado_em,
  count(distinct f.id) filter (
    where f.status = 'enviado' and coalesce(f.simulacao, false) = false
  ) as envios,
  count(distinct cv.id) filter (
    where coalesce(cv.simulacao, false) = false
      and exists (
        select 1 from public.mensagens m
        where m.conversa_id = cv.id and m.direcao = 'entrada'
      )
  ) as responderam,
  count(distinct cv.id) filter (
    where cv.motivo_encerramento = 'pessoa_errada'
      and coalesce(cv.simulacao, false) = false
  ) as pessoas_erradas,
  count(distinct p.id) filter (
    where p.status in ('recebido', 'confirmado') and coalesce(p.simulacao, false) = false
  ) as pagamentos,
  coalesce(sum(distinct p.valor) filter (
    where p.status in ('recebido', 'confirmado') and coalesce(p.simulacao, false) = false
  ), 0) as valor_recuperado
from public.fluxo_versoes fv
left join public.fila_envios f on f.fluxo_versao_id = fv.id
left join public.conversas cv on cv.fluxo_versao_id = fv.id
left join public.pagamentos p on p.devedor_id = cv.devedor_id
group by fv.id, fv.carteira_id, fv.versao, fv.nome, fv.criado_em;

grant select on public.v_desempenho_fluxos to authenticated;

-- O novo template fica candidato. O template aprovado atual continua sendo o fallback,
-- portanto a campanha nunca para enquanto a Meta analisa ou rejeita o novo modelo.
insert into public.configuracoes (chave, valor, descricao)
select
  'meta_abordagem_template_candidato',
  '{"language":"pt_BR","variaveis":["nome"],"variantes_horario":{"dia":"savan_confirmacao_identidade_dia_v2","tarde":"savan_confirmacao_identidade_tarde_v2","noite":"savan_confirmacao_identidade_noite_v2"}}'::jsonb,
  'Proximo template de abordagem. So e usado se estiver APPROVED; caso contrario o template ativo continua.'
where not exists (
  select 1 from public.configuracoes
  where chave = 'meta_abordagem_template_candidato' and cobrador_id is null
);

update public.configuracoes
set valor = '{"language":"pt_BR","variaveis":["nome"],"variantes_horario":{"dia":"savan_confirmacao_identidade_dia_v2","tarde":"savan_confirmacao_identidade_tarde_v2","noite":"savan_confirmacao_identidade_noite_v2"}}'::jsonb,
    descricao = 'Proximo template de abordagem. So e usado se estiver APPROVED; caso contrario o template ativo continua.',
    atualizado_em = now()
where chave = 'meta_abordagem_template_candidato' and cobrador_id is null;
