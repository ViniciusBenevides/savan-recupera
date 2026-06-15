-- SAVAN Recupera — 001: extensões, enums e tabelas
create extension if not exists pg_trgm;

-- ===== ENUMS =====
create type status_devedor as enum (
  'pendente','na_fila','contatado','em_negociacao','pix_gerado',
  'pago','recusado','sem_whatsapp','nao_perturbe','contestado','arquivado'
);
create type status_fila as enum ('aguardando','processando','enviado','falha','sem_whatsapp','cancelado');
create type estado_conversa as enum ('aguardando_resposta','bot_ativo','humano','pix_enviado','pago','encerrada','optout');
create type status_chip as enum ('cadastrado','conectado','aquecendo','ativo','pausado','desconectado','banido');
create type status_pagamento as enum ('pendente','recebido','confirmado','vencido','estornado','cancelado');
create type papel_usuario as enum ('admin','operador','visualizador');

-- ===== TABELAS =====
create table devedores (
  id bigint generated always as identity primary key,
  processo text unique not null,
  cpf_cnpj text not null,
  nome text not null,
  saldo numeric(12,2) not null default 0,
  grupo_credor text,
  carteira_credor text,
  cod_externo text,
  fase text,
  negociador text,
  status_original text,
  ocorrencia text,
  vencimento date,
  distribuicao date,
  uf char(2),
  cidade text,
  emails text[],
  tags text,
  motivo_inadimplencia text,
  status_cobranca status_devedor not null default 'pendente',
  prioridade int not null default 0,
  chatwoot_contact_id int,
  asaas_customer_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index idx_devedores_cpf on devedores (cpf_cnpj);
create index idx_devedores_status_prio on devedores (status_cobranca, prioridade desc);
create index idx_devedores_nome_trgm on devedores using gin (nome gin_trgm_ops);

create table telefones_devedor (
  id bigint generated always as identity primary key,
  devedor_id bigint not null references devedores (id) on delete cascade,
  telefone_e164 text not null,
  telefone_raw text,
  ordem smallint not null default 1,
  tipo text check (tipo in ('movel','fixo')),
  whatsapp_valido boolean,
  verificado_em timestamptz,
  unique (devedor_id, telefone_e164)
);
create index idx_telefones_e164 on telefones_devedor (telefone_e164);

create table chips (
  id serial primary key,
  nome text not null,
  numero_e164 text,
  chatwoot_inbox_id int,
  status status_chip not null default 'cadastrado',
  data_ativacao date,
  limite_dia_override int,
  ultimo_envio_em timestamptz,
  saude jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table chips_credenciais (
  chip_id int primary key references chips (id) on delete cascade,
  zapi_instance_id text not null,
  zapi_token text not null,
  criado_em timestamptz not null default now()
);

create table chip_metricas_diarias (
  chip_id int not null references chips (id) on delete cascade,
  dia date not null,
  novos_contatos int not null default 0,
  msgs_enviadas int not null default 0,
  respostas int not null default 0,
  primary key (chip_id, dia)
);

create table templates_mensagem (
  id serial primary key,
  nome text not null,
  tipo text not null check (tipo in (
    'abordagem_inicial','followup_1','followup_2','followup_3',
    'proposta','pix','confirmacao_pagamento','quitacao'
  )),
  conteudo text not null,
  ativo boolean not null default true,
  peso int not null default 1,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table fila_envios (
  id bigint generated always as identity primary key,
  devedor_id bigint not null references devedores (id) on delete cascade,
  telefone_id bigint references telefones_devedor (id) on delete set null,
  chip_id int references chips (id) on delete set null,
  status status_fila not null default 'aguardando',
  prioridade int not null default 0,
  tentativas smallint not null default 0,
  agendado_para timestamptz,
  template_id int references templates_mensagem (id) on delete set null,
  mensagem_renderizada text,
  chatwoot_conversation_id int,
  erro text,
  enviado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index idx_fila_aguardando on fila_envios (prioridade desc, id) where status = 'aguardando';
create index idx_fila_devedor on fila_envios (devedor_id);
create index idx_fila_processando on fila_envios (status) where status = 'processando';

create table conversas (
  id bigint generated always as identity primary key,
  devedor_id bigint not null references devedores (id) on delete cascade,
  chip_id int references chips (id) on delete set null,
  telefone_id bigint references telefones_devedor (id) on delete set null,
  chatwoot_conversation_id int unique not null,
  chatwoot_contact_id int,
  estado estado_conversa not null default 'aguardando_resposta',
  ultima_msg_em timestamptz,
  ultima_msg_de text check (ultima_msg_de in ('bot','devedor','humano','sistema')),
  followups_enviados smallint not null default 0,
  proximo_followup_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index idx_conversas_devedor on conversas (devedor_id);
create index idx_conversas_followup on conversas (proximo_followup_em) where estado = 'aguardando_resposta';

create table mensagens (
  id bigint generated always as identity primary key,
  conversa_id bigint not null references conversas (id) on delete cascade,
  direcao text not null check (direcao in ('entrada','saida')),
  origem text not null check (origem in ('bot','humano','devedor','sistema')),
  conteudo text,
  chatwoot_message_id bigint,
  criado_em timestamptz not null default now()
);
create index idx_mensagens_conversa on mensagens (conversa_id, criado_em);
create index idx_mensagens_criado_brin on mensagens using brin (criado_em);

create table negociacoes (
  id bigint generated always as identity primary key,
  devedor_id bigint not null references devedores (id) on delete cascade,
  conversa_id bigint references conversas (id) on delete set null,
  valor_original numeric(12,2) not null,
  desconto_pct numeric(5,2) not null,
  valor_proposto numeric(12,2) not null,
  faixa_aplicada text,
  desconto_extra_usado boolean not null default false,
  status text not null default 'proposta_enviada'
    check (status in ('proposta_enviada','aceita','recusada','expirada','paga')),
  validade date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index idx_negociacoes_devedor on negociacoes (devedor_id);
create index idx_negociacoes_conversa on negociacoes (conversa_id);

create table pagamentos (
  id bigint generated always as identity primary key,
  negociacao_id bigint references negociacoes (id) on delete set null,
  devedor_id bigint not null references devedores (id) on delete cascade,
  asaas_payment_id text unique not null,
  asaas_customer_id text,
  valor numeric(12,2) not null,
  valor_liquido numeric(12,2),
  comissao_operador numeric(12,2),
  repasse_savan numeric(12,2),
  pix_payload text,
  pix_qrcode_base64 text,
  invoice_url text,
  status status_pagamento not null default 'pendente',
  due_date date,
  pago_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index idx_pagamentos_devedor on pagamentos (devedor_id);
create index idx_pagamentos_status on pagamentos (status);
create index idx_pagamentos_negociacao on pagamentos (negociacao_id);

create table eventos_campanha (
  id bigint generated always as identity primary key,
  tipo text not null,
  devedor_id bigint,
  chip_id int,
  payload jsonb,
  criado_em timestamptz not null default now()
);
create index idx_eventos_tipo_data on eventos_campanha (tipo, criado_em desc);
create index idx_eventos_criado_brin on eventos_campanha using brin (criado_em);

create table metricas_diarias (
  dia date primary key,
  enviados int not null default 0,
  respostas int not null default 0,
  negociacoes int not null default 0,
  pix_gerados int not null default 0,
  pagamentos int not null default 0,
  valor_recuperado numeric(14,2) not null default 0,
  comissao numeric(14,2) not null default 0,
  optouts int not null default 0,
  falhas int not null default 0,
  atualizado_em timestamptz not null default now()
);

create table configuracoes (
  chave text primary key,
  valor jsonb not null,
  descricao text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create table usuarios_app (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text,
  email text,
  role papel_usuario not null default 'visualizador',
  criado_em timestamptz not null default now()
);

-- Runtime do bot (padrão anti-encavalamento da Secretária v3)
create table bot_fila_mensagens (
  id bigint generated always as identity primary key,
  chatwoot_conversation_id int not null,
  chatwoot_message_id bigint,
  conteudo text,
  tipo text,
  criado_em timestamptz not null default now()
);
create index idx_bot_fila_conversa on bot_fila_mensagens (chatwoot_conversation_id, id);

create table bot_locks (
  chatwoot_conversation_id int primary key,
  locked_at timestamptz not null default now()
);
