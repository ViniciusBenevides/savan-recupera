-- SAVAN Recupera — 019: hierarquia de 4 papéis (admin único · cobrador · credor · visualizador)
-- Parte A: enum + colunas de dono + backfill.
-- As funções de escopo e a reescrita de RLS ficam na 020 — o valor 'credor' recém-adicionado
-- não pode ser USADO na mesma transação em que é criado (regra do Postgres p/ ALTER TYPE ADD VALUE).

-- 1) ENUM: operador -> cobrador (rename preserva as linhas existentes) + novo valor 'credor'
alter type papel_usuario rename value 'operador' to 'cobrador';
alter type papel_usuario add value if not exists 'credor';

-- 2) COLUNAS DE DONO / TENANT
alter table usuarios_app
  add column if not exists cobrador_id uuid references usuarios_app (id) on delete set null,
  add column if not exists criado_por  uuid references usuarios_app (id) on delete set null;
comment on column usuarios_app.cobrador_id is 'Para credor/visualizador: o cobrador (tenant) a que pertencem. NULL para admin/cobrador.';
comment on column usuarios_app.criado_por is 'Quem criou este usuário (atribuição).';

alter table carteiras
  add column if not exists cobrador_id uuid references usuarios_app (id) on delete set null,
  add column if not exists credor_id   uuid references usuarios_app (id) on delete set null;
comment on column carteiras.cobrador_id is 'Cobrador (operador) dono desta carteira.';
comment on column carteiras.credor_id  is 'Usuário-credor dono desta carteira (vê o andamento, só leitura). carteiras.credor segue como rótulo exibido ao devedor.';

alter table chips
  add column if not exists cobrador_id uuid references usuarios_app (id) on delete set null;
comment on column chips.cobrador_id is 'Cobrador dono deste chip.';

-- SEGREDOS por cobrador: NULL = chave global/infra (admin); preenchido = chave do cobrador.
alter table segredos
  add column if not exists cobrador_id uuid references usuarios_app (id) on delete cascade;
-- a PK era só (chave); passa a permitir a mesma chave por cobrador + 1 global.
alter table segredos drop constraint if exists segredos_pkey;
create unique index if not exists uq_segredos_global   on segredos (chave) where cobrador_id is null;
create unique index if not exists uq_segredos_cobrador on segredos (chave, cobrador_id) where cobrador_id is not null;

-- índices de apoio ao escopo
create index if not exists idx_carteiras_cobrador on carteiras (cobrador_id);
create index if not exists idx_carteiras_credor   on carteiras (credor_id);
create index if not exists idx_chips_cobrador     on chips (cobrador_id);
create index if not exists idx_usuarios_cobrador  on usuarios_app (cobrador_id);

-- 3) ADMIN ÚNICO = vsbenevides1; demais admins viram cobrador (cada um com seu tenant)
update usuarios_app set role = 'cobrador'
  where role = 'admin' and lower(email) <> 'vsbenevides1@gmail.com';

-- 4) BACKFILL de dono nos dados existentes (banco praticamente zerado)
-- carteiras: dono = quem criou; se nulo, o admin da plataforma
update carteiras c set cobrador_id = coalesce(
    c.criado_por,
    (select id from usuarios_app where lower(email) = 'vsbenevides1@gmail.com'))
  where c.cobrador_id is null;
-- chips: sem criado_por -> admin da plataforma
update chips set cobrador_id = (select id from usuarios_app where lower(email) = 'vsbenevides1@gmail.com')
  where cobrador_id is null;
