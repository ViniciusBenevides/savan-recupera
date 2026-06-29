-- 025 — WhatsApp Cloud API (Meta oficial) como conector adicional por chip.
-- (§32) Z-API e Meta coexistem; cada chip usa UM conector. O atendimento de conversa segue
-- mediado pelo Chatwoot (canal nativo provider="whatsapp_cloud"); o SAVAN fala direto com a
-- Graph API só para qualidade/limites e gestão/aprovação de templates.
-- Idempotente. Aplicar via MCP apply_migration (projeto wmggqsmqvklxlqwsksjs).

-- 1) Conector do chip ------------------------------------------------------------------------
alter table chips add column if not exists conector text not null default 'zapi';
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'chips_conector_check'
  ) then
    alter table chips add constraint chips_conector_check check (conector in ('zapi','meta_cloud'));
  end if;
end $$;
comment on column chips.conector is
  'Conector do chip: zapi (WhatsApp Web não-oficial, QR) ou meta_cloud (API oficial da Meta).';

-- 2) Credenciais Meta Cloud (espelha o sigilo de chips_credenciais — só service_role) --------
create table if not exists chips_credenciais_meta (
  chip_id int primary key references chips (id) on delete cascade,
  phone_number_id text not null,           -- id do número na Graph API (POST /{id}/messages)
  waba_id text not null,                    -- WhatsApp Business Account id (templates, subscribed_apps)
  access_token text not null,              -- token permanente de usuário do sistema (System User)
  app_secret text,                          -- opcional: validação X-Hub-Signature-256 (webhook tempo real)
  webhook_verify_token text,                -- opcional: challenge do webhook
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table chips_credenciais_meta enable row level security;  -- SEM policy: só service_role
revoke all on table public.chips_credenciais_meta from authenticated, anon;

-- 3) Cache local dos templates da WABA (status de aprovação visível no painel) ---------------
-- Escopo por cobrador (padrão §21/§22). Sem segredos aqui (só metadados do template) → leitura
-- pelo dono; escrita só via service_role (API com guard), igual às demais tabelas pós-024.
create table if not exists meta_templates (
  id bigserial primary key,
  cobrador_id uuid not null,
  waba_id text not null,
  meta_template_id text,                    -- id do template na Meta (quando submetido)
  name text not null,
  language text not null default 'pt_BR',
  category text not null default 'UTILITY', -- MARKETING | UTILITY | AUTHENTICATION
  status text not null default 'PENDING',   -- APPROVED | PENDING | REJECTED | PAUSED | DISABLED
  components jsonb,                          -- HEADER/BODY/FOOTER/BUTTONS
  rejection_reason text,
  quality_score text,                       -- GREEN | YELLOW | RED | UNKNOWN
  sincronizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  unique (cobrador_id, waba_id, name, language)
);
alter table meta_templates enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='meta_templates' and policyname='sel_meta_templates') then
    create policy sel_meta_templates on meta_templates for select to authenticated
      using (fn_role() = 'admin' or cobrador_id = auth.uid());
  end if;
end $$;
revoke insert, update, delete on table public.meta_templates from authenticated, anon;

create index if not exists ix_meta_templates_cobrador on meta_templates (cobrador_id);
