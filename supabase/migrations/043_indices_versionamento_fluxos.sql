-- Indices das novas FKs usados ao trocar/restaurar versoes.

create index if not exists idx_carteiras_fluxo_versao_ativa
  on public.carteiras (fluxo_versao_ativa_id)
  where fluxo_versao_ativa_id is not null;

create index if not exists idx_fluxo_versoes_origem
  on public.fluxo_versoes (origem_versao_id)
  where origem_versao_id is not null;

create index if not exists idx_fluxo_versoes_criado_por
  on public.fluxo_versoes (criado_por)
  where criado_por is not null;

