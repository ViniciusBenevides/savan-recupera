-- MC COB — operação humana: ocorrências, agenda (retornos e promessas), acordos com parcelas,
-- responsável por devedor e limites de negociação por carteira.
--
-- Por quê: em 4 meses de robô sozinho não entrou nenhum pagamento. Quem paga dívida antiga paga
-- para uma pessoa. Estas tabelas dão ao negociador o ciclo do MC COB V5 (contato → resultado →
-- agenda → acordo → pagamento) com uma regra que nenhum sistema anterior tinha: toda promessa,
-- retorno e parcela tem data e volta para a fila "Trabalho de hoje" no dia certo.
--
-- Modelo de acesso igual ao resto do projeto: as páginas LEEM com o cliente da sessão (RLS abaixo);
-- toda ESCRITA passa pelas rotas de API com service role, depois dos guardas de lib/auth.ts.
-- Só aditiva: nenhuma tabela, coluna ou função existente muda de comportamento.

-- ============================================================
-- 1) Escopo: o negociador vê as carteiras do cobrador ao qual está ligado
-- ============================================================
create or replace function fn_carteiras_visiveis()
returns setof bigint language sql stable security definer set search_path = public as $$
  select c.id
  from carteiras c, (select role, cobrador_id from usuarios_app where id = auth.uid()) u
  where u.role = 'admin'
     or (u.role = 'cobrador'                     and c.cobrador_id = auth.uid())
     or (u.role = 'credor'                       and c.credor_id   = auth.uid())
     or (u.role in ('visualizador', 'negociador') and c.cobrador_id = u.cobrador_id);
$$;

-- ============================================================
-- 2) Limites de negociação por carteira (o "Quadro Cobrança" do CobCloud, em versão curta)
-- ============================================================
alter table carteiras
  add column if not exists tipo_carteira text not null default 'propria'
    check (tipo_carteira in ('propria', 'terceiros')),
  add column if not exists honorarios_pct numeric(5,2)
    check (honorarios_pct is null or honorarios_pct between 0 and 100),
  add column if not exists desconto_max_pct numeric(5,2) not null default 60
    check (desconto_max_pct between 0 and 95),
  add column if not exists parcelas_max smallint not null default 6
    check (parcelas_max between 1 and 60),
  add column if not exists entrada_min_pct numeric(5,2) not null default 0
    check (entrada_min_pct between 0 and 100),
  add column if not exists parcela_min_valor numeric(12,2) not null default 30
    check (parcela_min_valor >= 0),
  add column if not exists dias_sem_contato_max smallint not null default 15
    check (dias_sem_contato_max between 1 and 365);

comment on column carteiras.tipo_carteira is 'propria = MC CRED comprou (recebe 100%); terceiros = cobra para um credor e fica com honorarios_pct.';
comment on column carteiras.desconto_max_pct is 'Maior desconto que o negociador dá sozinho. Acima disso o acordo precisa de liberação do cobrador/admin.';
comment on column carteiras.dias_sem_contato_max is 'Devedor em negociação sem contato há mais que isso volta para o Trabalho de hoje.';

-- ============================================================
-- 3) Devedor: responsável e último contato
-- ============================================================
alter table devedores
  add column if not exists responsavel_id uuid references usuarios_app (id) on delete set null,
  add column if not exists ultimo_contato_em timestamptz;

create index if not exists idx_devedores_responsavel on devedores (responsavel_id) where responsavel_id is not null;
create index if not exists idx_devedores_ultimo_contato on devedores (carteira_id, ultimo_contato_em);

comment on column devedores.responsavel_id is 'Negociador responsável (a "Minha Carteira" do MC COB).';
comment on column devedores.ultimo_contato_em is 'Última ocorrência de contato real; mantido pelo gatilho de ocorrencias.';

-- ============================================================
-- 4) Ocorrências: cada contato e o resultado dele (o dossiê do devedor)
-- ============================================================
create table if not exists ocorrencias (
  id           bigint generated always as identity primary key,
  devedor_id   bigint not null references devedores (id) on delete cascade,
  carteira_id  bigint references carteiras (id) on delete cascade,
  autor_id     uuid references usuarios_app (id) on delete set null,
  autor_nome   text,
  canal        text not null default 'whatsapp'
    check (canal in ('whatsapp', 'ligacao', 'presencial', 'email', 'sistema', 'robo')),
  resultado    text not null
    check (resultado in ('sem_resposta', 'falou_com_titular', 'falou_com_terceiro', 'numero_errado',
                         'promessa', 'acordo', 'pagou', 'ja_pagou', 'pediu_retorno', 'recusou',
                         'contestou', 'nao_perturbe', 'falecido', 'anotacao')),
  descricao    text,
  conversa_id  bigint references conversas (id) on delete set null,
  criado_em    timestamptz not null default now()
);
create index if not exists idx_ocorrencias_devedor on ocorrencias (devedor_id, criado_em desc);
create index if not exists idx_ocorrencias_dia on ocorrencias (criado_em desc);
create index if not exists idx_ocorrencias_autor on ocorrencias (autor_id, criado_em desc);

-- ============================================================
-- 5) Agenda: retornos marcados e promessas de pagamento com data
-- ============================================================
create table if not exists agenda (
  id                   bigint generated always as identity primary key,
  devedor_id           bigint not null references devedores (id) on delete cascade,
  carteira_id          bigint references carteiras (id) on delete cascade,
  responsavel_id       uuid references usuarios_app (id) on delete set null,
  tipo                 text not null check (tipo in ('retorno', 'promessa')),
  quando               timestamptz not null,
  dia_inteiro          boolean not null default true,
  valor                numeric(12,2) check (valor is null or valor > 0),
  status               text not null default 'pendente'
    check (status in ('pendente', 'cumprida', 'quebrada', 'cancelada', 'remarcada')),
  observacao           text,
  origem_ocorrencia_id bigint references ocorrencias (id) on delete set null,
  criado_por           uuid references usuarios_app (id) on delete set null,
  criado_em            timestamptz not null default now(),
  concluido_em         timestamptz
);
create index if not exists idx_agenda_pendente on agenda (quando) where status = 'pendente';
create index if not exists idx_agenda_devedor on agenda (devedor_id, quando desc);
create index if not exists idx_agenda_responsavel on agenda (responsavel_id, quando) where status = 'pendente';

-- ============================================================
-- 6) Acordos e parcelas (parcela 0 = entrada)
-- ============================================================
create table if not exists acordos (
  id               bigint generated always as identity primary key,
  devedor_id       bigint not null references devedores (id) on delete cascade,
  carteira_id      bigint references carteiras (id) on delete cascade,
  criado_por       uuid references usuarios_app (id) on delete set null,
  criado_por_nome  text,
  valor_divida     numeric(12,2) not null check (valor_divida >= 0),
  desconto_pct     numeric(5,2) not null default 0 check (desconto_pct between 0 and 100),
  valor_total      numeric(12,2) not null check (valor_total > 0),
  entrada          numeric(12,2) not null default 0 check (entrada >= 0),
  parcelas         smallint not null default 1 check (parcelas between 1 and 60),
  forma_pagamento  text not null default 'pix'
    check (forma_pagamento in ('pix', 'loja', 'transferencia', 'boleto', 'dinheiro')),
  status           text not null default 'ativo' check (status in ('ativo', 'quitado', 'quebrado', 'cancelado')),
  liberado_por     uuid references usuarios_app (id) on delete set null,
  observacao       text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  quitado_em       timestamptz,
  encerrado_em     timestamptz
);
create index if not exists idx_acordos_devedor on acordos (devedor_id, criado_em desc);
create index if not exists idx_acordos_status on acordos (status, criado_em desc);
-- um devedor tem no máximo um acordo ativo por vez
create unique index if not exists uq_acordo_ativo_por_devedor on acordos (devedor_id) where status = 'ativo';

create table if not exists acordo_parcelas (
  id              bigint generated always as identity primary key,
  acordo_id       bigint not null references acordos (id) on delete cascade,
  numero          smallint not null check (numero >= 0),
  vencimento      date not null,
  valor           numeric(12,2) not null check (valor > 0),
  status          text not null default 'aberta' check (status in ('aberta', 'paga', 'cancelada')),
  pago_em         timestamptz,
  valor_pago      numeric(12,2) check (valor_pago is null or valor_pago > 0),
  forma_pagamento text check (forma_pagamento is null or forma_pagamento in ('pix', 'loja', 'transferencia', 'boleto', 'dinheiro')),
  pagamento_id    bigint references pagamentos (id) on delete set null,
  registrado_por  uuid references usuarios_app (id) on delete set null,
  observacao      text,
  unique (acordo_id, numero)
);
create index if not exists idx_parcelas_abertas on acordo_parcelas (vencimento) where status = 'aberta';
create index if not exists idx_parcelas_pagas on acordo_parcelas (pago_em desc) where status = 'paga';

drop trigger if exists trg_touch_acordos on acordos;
create trigger trg_touch_acordos before update on acordos
  for each row execute function fn_touch_atualizado_em();

-- ============================================================
-- 7) Gatilhos: o que cada registro faz sozinho
-- ============================================================

-- Ocorrência de contato real atualiza o último contato; "não perturbe" e falecimento viram
-- bloqueio permanente (mesma tabela que o robô respeita em fn_selecionar_lote).
create or replace function fn_ocorrencia_efeitos()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.resultado <> 'anotacao' then
    update devedores
       set ultimo_contato_em = greatest(coalesce(ultimo_contato_em, new.criado_em), new.criado_em)
     where id = new.devedor_id;
  end if;

  if new.resultado in ('nao_perturbe', 'falecido') then
    insert into bloqueios_contato (devedor_id, motivo, origem)
    values (new.devedor_id,
            case when new.resultado = 'falecido' then 'falecimento' else 'nao_perturbe' end,
            'ocorrencia:' || new.id)
    on conflict do nothing;
    update devedores
       set status_cobranca = case when new.resultado = 'falecido' then 'arquivado'::status_devedor
                                  else 'nao_perturbe'::status_devedor end
     where id = new.devedor_id;
    update agenda set status = 'cancelada', concluido_em = now()
     where devedor_id = new.devedor_id and status = 'pendente';
  elsif new.resultado = 'recusou' then
    update devedores set status_cobranca = 'recusado' where id = new.devedor_id
       and status_cobranca not in ('pago', 'nao_perturbe');
  elsif new.resultado = 'contestou' then
    update devedores set status_cobranca = 'contestado' where id = new.devedor_id
       and status_cobranca not in ('pago', 'nao_perturbe');
  elsif new.resultado in ('falou_com_titular', 'promessa', 'pediu_retorno', 'acordo') then
    update devedores set status_cobranca = 'em_negociacao' where id = new.devedor_id
       and status_cobranca in ('pendente', 'na_fila', 'contatado', 'recusado', 'sem_whatsapp');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ocorrencia_efeitos on ocorrencias;
create trigger trg_ocorrencia_efeitos after insert on ocorrencias
  for each row execute function fn_ocorrencia_efeitos();

-- Parcela paga: quando todas as parcelas do acordo estão pagas, o acordo é quitado e o devedor vira
-- "pago"; as promessas pendentes desse devedor são dadas como cumpridas.
create or replace function fn_parcela_paga()
returns trigger language plpgsql set search_path = public as $$
declare
  v_acordo acordos%rowtype;
  v_abertas int;
begin
  if new.status = 'paga' and (old.status is distinct from 'paga') then
    select * into v_acordo from acordos where id = new.acordo_id;
    select count(*) into v_abertas from acordo_parcelas
     where acordo_id = new.acordo_id and status = 'aberta' and id <> new.id;
    if v_abertas = 0 and v_acordo.status = 'ativo' then
      update acordos set status = 'quitado', quitado_em = coalesce(new.pago_em, now()), encerrado_em = now()
       where id = new.acordo_id;
      update devedores set status_cobranca = 'pago' where id = v_acordo.devedor_id;
    end if;
    update agenda set status = 'cumprida', concluido_em = now()
     where devedor_id = v_acordo.devedor_id and tipo = 'promessa' and status = 'pendente'
       and quando::date <= new.vencimento + 7;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_parcela_paga on acordo_parcelas;
create trigger trg_parcela_paga after update of status on acordo_parcelas
  for each row execute function fn_parcela_paga();

-- ============================================================
-- 8) Recebimentos: parcelas pagas + Pix confirmados fora de acordo, numa visão só
-- ============================================================
create or replace view v_recebimentos with (security_invoker = true) as
  select 'parcela'::text            as origem,
         p.id                       as ref_id,
         a.devedor_id,
         a.carteira_id,
         coalesce(p.pago_em, p.vencimento::timestamptz) as recebido_em,
         coalesce(p.valor_pago, p.valor)               as valor,
         coalesce(p.forma_pagamento, a.forma_pagamento) as forma,
         a.id                       as acordo_id,
         p.numero                   as parcela_numero,
         a.parcelas                 as parcelas_total
    from acordo_parcelas p
    join acordos a on a.id = p.acordo_id
   where p.status = 'paga'
  union all
  select 'pix'::text, pg.id, pg.devedor_id, d.carteira_id, pg.pago_em, pg.valor, 'pix', null, null, null
    from pagamentos pg
    join devedores d on d.id = pg.devedor_id
   where pg.status in ('recebido', 'confirmado')
     and not coalesce(pg.simulacao, false)
     and not exists (select 1 from acordo_parcelas ap where ap.pagamento_id = pg.id);

comment on view v_recebimentos is 'Tudo o que entrou: parcelas de acordo pagas (qualquer forma) + Pix confirmados que não estão ligados a uma parcela.';

-- ============================================================
-- 9) RLS: leitura pelo escopo das carteiras; escrita só pela API (service role)
-- ============================================================
alter table ocorrencias      enable row level security;
alter table agenda           enable row level security;
alter table acordos          enable row level security;
alter table acordo_parcelas  enable row level security;

drop policy if exists ocorrencias_select on ocorrencias;
create policy ocorrencias_select on ocorrencias for select to authenticated
  using (devedor_id in (select fn_devedores_visiveis()));

drop policy if exists agenda_select on agenda;
create policy agenda_select on agenda for select to authenticated
  using (devedor_id in (select fn_devedores_visiveis()));

drop policy if exists acordos_select on acordos;
create policy acordos_select on acordos for select to authenticated
  using (devedor_id in (select fn_devedores_visiveis()));

drop policy if exists acordo_parcelas_select on acordo_parcelas;
create policy acordo_parcelas_select on acordo_parcelas for select to authenticated
  using (acordo_id in (select id from acordos where devedor_id in (select fn_devedores_visiveis())));

revoke insert, update, delete on ocorrencias, agenda, acordos, acordo_parcelas from anon, authenticated;
grant select on ocorrencias, agenda, acordos, acordo_parcelas, v_recebimentos to authenticated;
grant all on ocorrencias, agenda, acordos, acordo_parcelas to service_role;

-- Realtime: a fila do dia se atualiza quando alguém registra contato, promessa ou pagamento.
do $$
begin
  begin alter publication supabase_realtime add table ocorrencias;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table agenda;          exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table acordo_parcelas; exception when duplicate_object then null; end;
end $$;

-- ============================================================
-- 10) Conversas esperando resposta de uma pessoa (o devedor escreveu por último e ninguém leu)
--     O filtro compara duas colunas, o que o PostgREST não faz direto.
-- ============================================================
create or replace view v_conversas_esperando with (security_invoker = true) as
  select c.id, c.devedor_id, c.carteira_id, c.ultima_msg_em, c.estado, c.atendente_id
    from conversas c
   where c.ultima_msg_de = 'devedor'
     and (c.lida_em is null or c.lida_em < c.ultima_msg_em)
     and c.estado not in ('pago', 'encerrada', 'optout')
     and not coalesce(c.simulacao, false);

grant select on v_conversas_esperando to authenticated;

-- ============================================================
-- 11) Funil por carteira (Relatórios → Resultado). security_invoker: cada um vê só as suas.
-- ============================================================
-- Funil por carteira. Cada devedor entra até a etapa mais funda que já alcançou (quem tem acordo também
-- conta como contatado, respondeu e negociou), então uma etapa nunca tem mais gente que a anterior:
-- um funil que "sobe" no meio parece dado quebrado para quem lê.
create or replace view v_funil_carteira with (security_invoker = true) as
  with etapa as (
    select d.id, d.carteira_id, d.saldo, d.status_cobranca,
           case
             when d.status_cobranca = 'pago' then 5
             when exists (select 1 from acordos a where a.devedor_id = d.id)
               or exists (select 1 from agenda g where g.devedor_id = d.id and g.tipo = 'promessa') then 4
             when d.status_cobranca in ('em_negociacao', 'pix_gerado') then 3
             when exists (select 1 from conversas cv join mensagens m on m.conversa_id = cv.id
                           where cv.devedor_id = d.id and m.direcao = 'entrada')
               or exists (select 1 from ocorrencias o where o.devedor_id = d.id
                           and o.resultado in ('falou_com_titular', 'promessa', 'acordo', 'pagou', 'ja_pagou',
                                               'pediu_retorno', 'recusou', 'contestou')) then 2
             when d.ultimo_contato_em is not null
               or exists (select 1 from conversas cv where cv.devedor_id = d.id) then 1
             else 0
           end as etapa
      from devedores d
  )
  select c.id as carteira_id,
         c.nome,
         count(e.id)                                   as base,
         coalesce(sum(e.saldo), 0)                     as saldo_total,
         count(e.id) filter (where e.etapa >= 1)       as contatados,
         count(e.id) filter (where e.etapa >= 2)       as responderam,
         count(e.id) filter (where e.etapa >= 3)       as negociando,
         count(e.id) filter (where e.etapa >= 4)       as acordo_ou_promessa,
         count(e.id) filter (where e.etapa >= 5)       as pagos,
         -- o que ainda está para receber: o "Carteira em aberto" do Painel do MC COB
         coalesce(sum(e.saldo) filter (where e.status_cobranca is distinct from 'pago'), 0) as saldo_aberto
    from carteiras c
    left join etapa e on e.carteira_id = c.id
   group by c.id, c.nome;

grant select on v_funil_carteira to authenticated;
