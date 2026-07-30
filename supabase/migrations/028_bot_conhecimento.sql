-- SAVAN Recupera — 028: base de conhecimento do bot, com aprovação (§33)
--
-- O cérebro do bot era só persona + contexto + guardrails em texto livre: toda objeção recorrente
-- ("isso não prescreveu?", "não reconheço essa dívida", "dá pra parcelar?") exigia reescrever o prompt
-- da carteira. Aqui a resposta vira DADO: cadastrada, revisada e só então usada.
--
-- O gate `aprovado` é o ponto central. Num produto de cobrança com restrição jurídica (§1 — nunca
-- ameaçar, nunca citar negativação, responder prescrição com honestidade), texto novo não pode chegar
-- ao devedor porque alguém digitou e salvou. Modelo emprestado do cnpj.biz, que faz o mesmo com os
-- documentos que alimentam a IA deles.

create table if not exists bot_conhecimento (
  id           serial primary key,
  -- escopo: NULL = vale para todas as carteiras; preenchido = só daquela carteira
  carteira_id  int references carteiras (id) on delete cascade,
  cobrador_id  uuid references auth.users (id) on delete cascade,
  pergunta     text not null,
  resposta     text not null,
  aprovado     boolean not null default false,
  ativo        boolean not null default true,
  criado_por   uuid references auth.users (id) on delete set null,
  aprovado_por uuid references auth.users (id) on delete set null,
  aprovado_em  timestamptz,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_bot_conhecimento_escopo on bot_conhecimento (carteira_id, cobrador_id) where ativo;
create index if not exists idx_bot_conhecimento_uso    on bot_conhecimento (aprovado, ativo);

drop trigger if exists trg_bot_conhecimento_touch on bot_conhecimento;
create trigger trg_bot_conhecimento_touch before update on bot_conhecimento
  for each row execute function fn_touch_atualizado_em();

alter table bot_conhecimento enable row level security;

-- leitura no mesmo escopo por tenant do resto do produto (§21/§20)
drop policy if exists sel_bot_conhecimento on bot_conhecimento;
create policy sel_bot_conhecimento on bot_conhecimento
  for select to authenticated
  using (
    fn_role() = 'admin'::papel_usuario
    or cobrador_id is null
    or cobrador_id = fn_meu_cobrador()
  );

-- escrita só pela API (service_role), como todo o resto depois do hardening da §29
revoke insert, update, delete on bot_conhecimento from authenticated, anon;

comment on table bot_conhecimento is
  'Perguntas e respostas que o bot pode usar. Só entra no prompt com aprovado=true e ativo=true (§33).';
comment on column bot_conhecimento.aprovado is
  'Gate humano: enquanto false, a entrada NÃO é enviada ao modelo. Editar deve derrubar para false.';
