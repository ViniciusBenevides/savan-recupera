-- SAVAN Recupera — 010: distribuição de carteira, maturidade de chip,
-- failover e ledger de escalação (transparência). Migração aditiva (schema).

-- ===== CHIPS: maturidade + região =====
alter table chips
  add column if not exists maturidade text not null default 'novo'
    check (maturidade in ('novo','aquecido')),
  add column if not exists aquecimento_perfil text,   -- NULL = faixa global 'aquecimento'
  add column if not exists regiao_uf text[],            -- atribuição opcional (estratégia/sugestão)
  add column if not exists regiao_cidade text[];

comment on column chips.maturidade is 'novo = número frio (ramp longo); aquecido = já operava (ramp curto/definido)';
comment on column chips.aquecimento_perfil is 'chave em configuracoes com a curva de aquecimento (ex.: aquecimento_rapido). NULL usa a global.';

-- ===== CARTEIRAS: estratégia de distribuição =====
alter table carteiras
  add column if not exists estrategia_distribuicao text not null default 'igualitario'
    check (estrategia_distribuicao in ('igualitario','uf','cidade','manual'));

comment on column carteiras.estrategia_distribuicao is 'Como dividir os devedores entre chips: igualitario | uf | cidade | manual';

-- ===== FILA: chip planejado (designação) =====
alter table fila_envios
  add column if not exists chip_designado_id int references chips (id) on delete set null;

comment on column fila_envios.chip_designado_id is 'Chip PLANEJADO para este devedor (NULL = pool livre). chip_id = quem efetivamente pegou.';

create index if not exists idx_fila_designado
  on fila_envios (chip_designado_id) where status = 'aguardando';

-- ===== LEDGER DE ESCALAÇÃO (transparência bilateral / anti-fraude) =====
create table if not exists escalacoes (
  id bigint generated always as identity primary key,
  conversa_id bigint references conversas (id) on delete set null,
  devedor_id bigint references devedores (id) on delete cascade,
  carteira_id bigint references carteiras (id) on delete set null,
  chip_id int references chips (id) on delete set null,    -- de onde escalou
  motivo text,
  contexto_snapshot jsonb,                                  -- últimas mensagens no momento da escala
  status text not null default 'aberta'
    check (status in ('aberta','em_atendimento','fechada_acordo','fechada_sem_acordo','fechada_paga')),
  assumido_por text,                                        -- agente/usuário humano que assumiu
  negociacao_id bigint references negociacoes (id) on delete set null,
  pagamento_id bigint references pagamentos (id) on delete set null,
  valor_combinado numeric(12,2),                            -- acordo registrado manualmente (sempre visível)
  observacao text,
  criado_em timestamptz not null default now(),
  fechado_em timestamptz
);
create index if not exists idx_escalacoes_devedor on escalacoes (devedor_id);
create index if not exists idx_escalacoes_status on escalacoes (status, criado_em desc);
create index if not exists idx_escalacoes_aberta on escalacoes (devedor_id) where status in ('aberta','em_atendimento');

-- ===== EVENTOS DE FAILOVER (alimenta o banner do painel) =====
create table if not exists failover_eventos (
  id bigint generated always as identity primary key,
  chip_caido_id int references chips (id) on delete cascade,
  detectado_em timestamptz not null default now(),
  status text not null default 'pendente'
    check (status in ('pendente','aplicado','ignorado')),
  resumo jsonb,                                             -- {aguardando, conversas_ativas, escaladas}
  chip_destino_id int references chips (id) on delete set null,
  aplicado_em timestamptz,
  aplicado_por uuid
);
create index if not exists idx_failover_status on failover_eventos (status, detectado_em desc);
-- no máximo 1 evento pendente por chip caído (evita banners duplicados)
create unique index if not exists uq_failover_pendente
  on failover_eventos (chip_caido_id) where status = 'pendente';

-- ===== SEEDS: curva de aquecimento curto (chip já aquecido) =====
insert into configuracoes (chave, valor, descricao) values
('aquecimento_rapido',
 '[{"de":1,"ate":3,"limite":250},{"de":4,"ate":9999,"limite":500}]',
 'Curva de aquecimento curta para chips marcados como JÁ AQUECIDOS (sugestão; o usuário pode ajustar)')
on conflict (chave) do nothing;

-- ===== RLS (espelha o padrão de carteiras: leitura authenticated, escrita admin/operador) =====
alter table escalacoes enable row level security;
alter table failover_eventos enable row level security;

create policy sel_escalacoes on escalacoes for select to authenticated using (true);
create policy ins_escalacoes on escalacoes for insert to authenticated
  with check (fn_role() in ('admin','operador'));
create policy upd_escalacoes on escalacoes for update to authenticated
  using (fn_role() in ('admin','operador')) with check (fn_role() in ('admin','operador'));

create policy sel_failover on failover_eventos for select to authenticated using (true);
create policy ins_failover on failover_eventos for insert to authenticated
  with check (fn_role() in ('admin','operador'));
create policy upd_failover on failover_eventos for update to authenticated
  using (fn_role() in ('admin','operador')) with check (fn_role() in ('admin','operador'));

-- ===== REALTIME =====
alter publication supabase_realtime add table escalacoes;
alter publication supabase_realtime add table failover_eventos;
