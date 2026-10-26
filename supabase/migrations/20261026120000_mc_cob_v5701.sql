-- MC COB — o que a V5.7.01 do Maurelio trouxe depois da V5.5.10 e faz sentido no sistema on-line:
--   1) auditoria das ações de risco (quem fez, quando, o que havia);
--   2) excluir telefone sem perder o histórico (V5.5.11);
--   3) inativar e excluir cliente, só o administrador (V5.7.01);
--   4) metas diárias de produtividade por pessoa da equipe (V5.6.13/14);
--   5) ordem da fila por carteira: mais antigos ou mais recentes primeiro (V5.5.20);
--   6) importação que só enriquece contatos de quem já existe (V5.6.16);
--   7) Jurídico automático: fontes oficiais, precedentes, análises, casos e documentos (V5.6.00–02).
--
-- Mesmo modelo de acesso do resto do projeto: as telas LEEM pela sessão (RLS abaixo) e toda ESCRITA
-- passa pelas rotas de API com service role, depois dos guardas de lib/auth.ts.
-- Só aditiva: o único comportamento existente que muda é a ordem do fn_selecionar_lote, e só nas
-- carteiras em que o dono escolher "mais antigos" ou "mais recentes" (o padrão continua o de hoje).

-- ============================================================
-- 1) Auditoria
-- ============================================================
create table if not exists auditoria (
  id           bigint generated always as identity primary key,
  acao         text not null,
  entidade     text not null,
  entidade_id  text,
  -- sem FK de propósito: o registro da exclusão precisa sobreviver ao que foi excluído
  carteira_id  bigint,
  devedor_id   bigint,
  autor_id     uuid references usuarios_app (id) on delete set null,
  autor_nome   text,
  detalhe      jsonb not null default '{}'::jsonb,
  criado_em    timestamptz not null default now()
);
create index if not exists idx_auditoria_criado on auditoria (criado_em desc);
create index if not exists idx_auditoria_devedor on auditoria (devedor_id, criado_em desc) where devedor_id is not null;
create index if not exists idx_auditoria_autor on auditoria (autor_id);

comment on table auditoria is 'Ações de risco feitas pelo painel (exclusões, inativações, aprovações jurídicas). Só a API grava.';

-- ============================================================
-- 2) Telefone excluído: sai de toda operação, o registro fica
-- ============================================================
alter table telefones_devedor
  add column if not exists excluido_em       timestamptz,
  add column if not exists excluido_por      uuid references usuarios_app (id) on delete set null,
  add column if not exists excluido_por_nome text,
  add column if not exists motivo_exclusao   text;
create index if not exists idx_telefones_excluido_por on telefones_devedor (excluido_por) where excluido_por is not null;

comment on column telefones_devedor.excluido_em is
  'Excluído pela equipe. O robô já ignora porque whatsapp_valido vira false; a linha fica para o histórico das conversas.';

-- Exclui um telefone: tira da operação, solta a fila que apontava para ele e, se houver outro
-- celular elegível, devolve a pessoa para a fila com esse número (o "saneamento" da V5).
-- Uma mensagem que a pessoa mandar desse número continua chegando no dossiê: um "pare" tem de valer.
create or replace function fn_excluir_telefone(p_telefone_id bigint, p_autor uuid, p_autor_nome text, p_motivo text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_tel telefones_devedor%rowtype;
  v_fila fila_envios%rowtype;
  v_canceladas int := 0;
  v_substituto bigint;
  v_requeue boolean := false;
  v_restam int;
begin
  select * into v_tel from telefones_devedor where id = p_telefone_id for update;
  if not found then raise exception 'telefone_nao_encontrado'; end if;
  if v_tel.excluido_em is not null then raise exception 'telefone_ja_excluido'; end if;

  update telefones_devedor
     set excluido_em = now(), excluido_por = p_autor, excluido_por_nome = p_autor_nome,
         motivo_exclusao = nullif(trim(p_motivo), ''), whatsapp_valido = false
   where id = p_telefone_id;

  -- A abordagem que ainda não saiu por esse número é cancelada (a que já saiu fica no histórico)
  select * into v_fila from fila_envios
   where telefone_id = p_telefone_id and status = 'aguardando'
   order by id limit 1;
  update fila_envios set status = 'cancelado', erro = 'telefone excluído pela equipe'
   where telefone_id = p_telefone_id and status = 'aguardando';
  get diagnostics v_canceladas = row_count;

  -- O próximo celular elegível, com os mesmos filtros do robô
  select id into v_substituto from telefones_devedor
   where devedor_id = v_tel.devedor_id and id <> p_telefone_id and excluido_em is null
     and tipo = 'movel' and (whatsapp_valido is null or whatsapp_valido = true)
   order by ordem, id limit 1;

  if v_tel.ordem = 1 then
    update telefones_devedor set ordem = 1
     where id = (select id from telefones_devedor
                  where devedor_id = v_tel.devedor_id and id <> p_telefone_id and excluido_em is null
                  order by ordem, id limit 1);
  end if;

  if v_canceladas > 0 and v_substituto is not null
     and not exists (select 1 from fila_envios f where f.devedor_id = v_tel.devedor_id and f.status in ('aguardando', 'processando'))
     and not exists (select 1 from bloqueios_contato b where b.devedor_id = v_tel.devedor_id) then
    insert into fila_envios (devedor_id, telefone_id, carteira_id, status, prioridade, chip_designado_id, simulacao)
    values (v_fila.devedor_id, v_substituto, v_fila.carteira_id, 'aguardando', v_fila.prioridade, v_fila.chip_designado_id, false);
    v_requeue := true;
  end if;

  select count(*) into v_restam from telefones_devedor
   where devedor_id = v_tel.devedor_id and excluido_em is null;

  return jsonb_build_object(
    'devedor_id', v_tel.devedor_id, 'telefone', v_tel.telefone_e164, 'fila_cancelada', v_canceladas,
    'voltou_para_fila', v_requeue, 'substituto_id', v_substituto, 'restam', v_restam
  );
end;
$$;
revoke execute on function fn_excluir_telefone(bigint, uuid, text, text) from public, anon, authenticated;
grant execute on function fn_excluir_telefone(bigint, uuid, text, text) to service_role;

-- ============================================================
-- 3) Cliente inativo (sai da operação, histórico preservado)
-- ============================================================
alter table devedores
  add column if not exists inativo_em          timestamptz,
  add column if not exists inativado_por       uuid references usuarios_app (id) on delete set null,
  add column if not exists inativado_por_nome  text,
  add column if not exists situacao_antes_inativar status_devedor;
create index if not exists idx_devedores_inativado_por on devedores (inativado_por) where inativado_por is not null;
create index if not exists idx_devedores_ativos on devedores (carteira_id) where inativo_em is null;

comment on column devedores.inativo_em is
  'Inativado pelo administrador: situação vira arquivado, fila e agenda canceladas, conversa parada. Reativar devolve a situação anterior.';

create or replace function fn_inativar_devedor(p_devedor_id bigint, p_autor uuid, p_autor_nome text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_dev devedores%rowtype;
  v_fila int; v_agenda int; v_conversas int;
begin
  select * into v_dev from devedores where id = p_devedor_id for update;
  if not found then raise exception 'devedor_nao_encontrado'; end if;
  if v_dev.inativo_em is not null then raise exception 'devedor_ja_inativo'; end if;

  update devedores
     set inativo_em = now(), inativado_por = p_autor, inativado_por_nome = p_autor_nome,
         situacao_antes_inativar = status_cobranca, status_cobranca = 'arquivado'
   where id = p_devedor_id;

  update fila_envios set status = 'cancelado', erro = 'cliente inativado'
   where devedor_id = p_devedor_id and status = 'aguardando';
  get diagnostics v_fila = row_count;

  update agenda set status = 'cancelada', concluido_em = now()
   where devedor_id = p_devedor_id and status = 'pendente';
  get diagnostics v_agenda = row_count;

  -- O robô não responde nem faz follow-up/failover em conversa encerrada. Conversa com pessoa
  -- (humano) ou com Pix gerado fica como está: aí quem decide é a equipe.
  update conversas set estado = 'encerrada', motivo_encerramento = 'outro', proximo_followup_em = null
   where devedor_id = p_devedor_id and estado in ('aguardando_resposta', 'bot_ativo');
  get diagnostics v_conversas = row_count;

  return jsonb_build_object('situacao_anterior', v_dev.status_cobranca, 'fila_cancelada', v_fila,
                            'agenda_cancelada', v_agenda, 'conversas_encerradas', v_conversas);
end;
$$;

create or replace function fn_reativar_devedor(p_devedor_id bigint)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_dev devedores%rowtype;
begin
  select * into v_dev from devedores where id = p_devedor_id for update;
  if not found then raise exception 'devedor_nao_encontrado'; end if;
  if v_dev.inativo_em is null then raise exception 'devedor_nao_inativo'; end if;
  update devedores
     set status_cobranca = coalesce(situacao_antes_inativar, 'pendente'), situacao_antes_inativar = null,
         inativo_em = null, inativado_por = null, inativado_por_nome = null
   where id = p_devedor_id;
  return jsonb_build_object('situacao', coalesce(v_dev.situacao_antes_inativar, 'pendente'));
end;
$$;

-- ============================================================
-- 4) Metas diárias de produtividade
-- ============================================================
create table if not exists metas_produtividade (
  usuario_id         uuid primary key references usuarios_app (id) on delete cascade,
  meta_clientes      int not null default 0 check (meta_clientes between 0 and 1000),
  meta_acionamentos  int not null default 0 check (meta_acionamentos between 0 and 1000),
  atualizado_por     uuid references usuarios_app (id) on delete set null,
  atualizado_em      timestamptz not null default now()
);
create index if not exists idx_metas_atualizado_por on metas_produtividade (atualizado_por);
comment on table metas_produtividade is 'Meta por dia de clientes únicos e de acionamentos. 0 = sem meta.';

-- Para contar a produção do dia sem varrer mensagens inteiras
create index if not exists idx_mensagens_autor_dia on mensagens (autor_id, criado_em desc)
  where origem = 'humano' and direcao = 'saida';

-- ============================================================
-- 5) Ordem da fila por carteira
-- ============================================================
alter table carteiras
  add column if not exists ordem_fila text not null default 'prioridade'
    check (ordem_fila in ('prioridade', 'antigos', 'recentes'));
comment on column carteiras.ordem_fila is
  'prioridade = como sempre (prioridade da importação); antigos/recentes = vencimento mais antigo ou mais recente primeiro, sem vencimento no fim. Vale para o robô, a lista e as planilhas.';

-- Mesmo fn_selecionar_lote de 20260902180000 (com processando_desde), só com a ordem da carteira
-- antes da prioridade.
create or replace function fn_selecionar_lote(p_chip_id integer, p_n integer)
returns setof fila_envios
language sql
set search_path = public
as $function$
  update fila_envios
  set status = 'processando', chip_id = p_chip_id, processando_desde = now()
  where id in (
    select fe.id from fila_envios fe
    where fe.status = 'aguardando'
      and (fe.agendado_para is null or fe.agendado_para <= now())
      and (fe.chip_designado_id = p_chip_id or fe.chip_designado_id is null)
      -- chip com abordagem travada não INICIA conversa (continua respondendo pelo bot-turno)
      and not exists (
        select 1 from chips c3
        where c3.id = p_chip_id and c3.abordagem_travada_ate is not null
          and c3.abordagem_travada_ate > now()
      )
      -- ADR-0003: quem pediu para parar não recebe abordagem de nenhum chip, nunca mais
      and not exists (
        select 1 from bloqueios_contato b where b.devedor_id = fe.devedor_id
      )
      -- carteira ativa E este chip vinculado a ela
      and exists (
        select 1 from devedores d
        join carteiras c on c.id = d.carteira_id
        join carteira_chips cc on cc.carteira_id = c.id and cc.chip_id = p_chip_id
        where d.id = fe.devedor_id and c.status = 'ativa'
      )
    order by (fe.chip_designado_id = p_chip_id) desc nulls last,
      -- a ordem que o dono escolheu para a carteira (V5.5.20); sem vencimento vai para o fim
      (select case when c.ordem_fila = 'antigos' then d.vencimento end
         from devedores d join carteiras c on c.id = d.carteira_id where d.id = fe.devedor_id) asc nulls last,
      (select case when c.ordem_fila = 'recentes' then d.vencimento end
         from devedores d join carteiras c on c.id = d.carteira_id where d.id = fe.devedor_id) desc nulls last,
      fe.prioridade desc, fe.id
    limit p_n
    for update skip locked
  )
  returning *;
$function$;

-- ============================================================
-- 6) Importação que só enriquece
-- ============================================================
alter table importacoes
  add column if not exists modo text not null default 'carga' check (modo in ('carga', 'enriquecer')),
  add column if not exists resumo jsonb;
comment on column importacoes.modo is
  'carga = cria e atualiza devedores; enriquecer = só acrescenta telefones, e-mails e cidade/UF de quem já existe na carteira.';

-- ============================================================
-- 7) Jurídico automático
-- ============================================================
alter table devedores
  add column if not exists titulo_especie    text,
  add column if not exists titulo_emissao    date,
  add column if not exists prescricao_em     date,
  add column if not exists titulo_observacao text;
comment on column devedores.titulo_especie is 'Espécie do título da dívida (cheque, duplicata, nota promissória, contrato, crediário…), para a triagem jurídica.';
comment on column devedores.prescricao_em is 'Data de prescrição conferida pela equipe. Sem ela, o Jurídico trata a prescrição como alerta, nunca como certeza.';

-- 7.1 Fontes oficiais monitoradas (legislação do Planalto e portais de jurisprudência)
create table if not exists juridico_fontes (
  chave              text primary key,
  nome               text not null,
  tipo               text not null check (tipo in ('LEGISLACAO', 'JURISPRUDENCIA')),
  nivel              text not null default 'A' check (nivel in ('A', 'B', 'C')),
  url                text not null,
  critica            boolean not null default false,
  status             text not null default 'NUNCA_VERIFICADA',
  http_status        int,
  sha256             text,
  sha256_anterior    text,
  alterada           boolean not null default false,
  artigos_alterados  text[] not null default '{}',
  erro               text,
  verificada_em      timestamptz,
  ok_em              timestamptz,
  snapshot_path      text,
  atualizado_em      timestamptz not null default now()
);

create table if not exists juridico_fontes_versoes (
  id                 bigint generated always as identity primary key,
  chave              text not null references juridico_fontes (chave) on delete cascade,
  sha256             text not null,
  sha256_anterior    text,
  snapshot_path      text,
  artigos_alterados  text[] not null default '{}',
  verificada_em      timestamptz not null default now(),
  unique (chave, sha256)
);

-- 7.2 Precedentes cadastrados à mão, só com URL oficial confirmada
create table if not exists juridico_precedentes (
  id             bigint generated always as identity primary key,
  tribunal       text not null,
  processo       text,
  tema           text,
  tese           text not null,
  nivel          text not null default 'B' check (nivel in ('A', 'B', 'C')),
  publicado_em   date,
  url_oficial    text not null,
  ativo          boolean not null default true,
  verificado_em  timestamptz,
  observacao     text,
  criado_por     uuid references usuarios_app (id) on delete set null,
  criado_em      timestamptz not null default now()
);
create index if not exists idx_precedentes_criado_por on juridico_precedentes (criado_por);

-- 7.3 Documentos do devedor (contrato, nota, comprovante…) com o texto extraído para a triagem
create table if not exists devedor_documentos (
  id               bigint generated always as identity primary key,
  devedor_id       bigint not null references devedores (id) on delete cascade,
  carteira_id      bigint references carteiras (id) on delete cascade,
  tipo             text not null,
  nome             text not null,
  observacao       text,
  arquivo_path     text,
  arquivo_mime     text,
  arquivo_tamanho  bigint,
  texto_extraido   text,
  criado_por       uuid references usuarios_app (id) on delete set null,
  criado_por_nome  text,
  criado_em        timestamptz not null default now()
);
create index if not exists idx_documentos_devedor on devedor_documentos (devedor_id, criado_em desc);
create index if not exists idx_documentos_carteira on devedor_documentos (carteira_id);
create index if not exists idx_documentos_criado_por on devedor_documentos (criado_por);

-- 7.4 Análises: o retrato do que o motor leu, com a versão e o estado das fontes daquele dia
create table if not exists juridico_analises (
  id                     bigint generated always as identity primary key,
  devedor_id             bigint not null references devedores (id) on delete cascade,
  carteira_id            bigint references carteiras (id) on delete cascade,
  versao_motor           text not null,
  status                 text not null default 'RASCUNHO' check (status in ('RASCUNHO', 'APROVADA')),
  saldo                  numeric(12,2) not null default 0,
  titulos                int not null default 0,
  primeiro_venc          date,
  ultimo_venc            date,
  anos                   int[] not null default '{}',
  medida                 text not null,
  alternativa            text,
  confianca              int not null default 0 check (confianca between 0 and 100),
  forca_prova            text,
  fontes_status          text not null,
  fontes_verificadas_em  timestamptz,
  fontes                 jsonb not null default '[]'::jsonb,
  fatos                  jsonb not null default '{}'::jsonb,
  sinais                 jsonb not null default '{}'::jsonb,
  pendencias             jsonb not null default '[]'::jsonb,
  riscos                 jsonb not null default '[]'::jsonb,
  fundamentos            jsonb not null default '[]'::jsonb,
  jurisprudencia         jsonb not null default '{}'::jsonb,
  fundamentacao          text,
  defesa                 text,
  estrategia             text,
  minuta                 text,
  modelo_ia              text,
  criado_por             uuid references usuarios_app (id) on delete set null,
  criado_por_nome        text,
  aprovado_por           uuid references usuarios_app (id) on delete set null,
  aprovado_por_nome      text,
  aprovado_em            timestamptz,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
create index if not exists idx_analises_devedor on juridico_analises (devedor_id, criado_em desc);
create index if not exists idx_analises_carteira on juridico_analises (carteira_id, criado_em desc);
create index if not exists idx_analises_criado_por on juridico_analises (criado_por);
create index if not exists idx_analises_aprovado_por on juridico_analises (aprovado_por);

-- 7.5 Casos jurídicos (o processo formal depois da decisão do advogado)
create table if not exists juridico_casos (
  id             bigint generated always as identity primary key,
  devedor_id     bigint not null references devedores (id) on delete cascade,
  carteira_id    bigint references carteiras (id) on delete cascade,
  analise_id     bigint unique references juridico_analises (id) on delete set null,
  etapa          text not null default 'Pré-jurídico',
  prioridade     text not null default 'Média' check (prioridade in ('Alta', 'Média', 'Baixa')),
  acao           text not null default 'Ação de cobrança',
  cnj            text,
  tribunal       text,
  comarca        text,
  vara           text,
  valor_causa    numeric(12,2),
  custas         numeric(12,2),
  responsavel    text,
  proxima_acao   text,
  prazo          date,
  status         text not null default 'Aberto',
  observacao     text,
  criado_por     uuid references usuarios_app (id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists idx_casos_devedor on juridico_casos (devedor_id);
create index if not exists idx_casos_carteira on juridico_casos (carteira_id, status);
create index if not exists idx_casos_criado_por on juridico_casos (criado_por);

drop trigger if exists trg_touch_juridico_analises on juridico_analises;
create trigger trg_touch_juridico_analises before update on juridico_analises
  for each row execute function fn_touch_atualizado_em();
drop trigger if exists trg_touch_juridico_casos on juridico_casos;
create trigger trg_touch_juridico_casos before update on juridico_casos
  for each row execute function fn_touch_atualizado_em();

-- 7.6 Arquivos privados: o texto oficial de cada versão e os documentos dos devedores
insert into storage.buckets (id, name, public, file_size_limit)
values ('juridico-fontes', 'juridico-fontes', false, 52428800)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-devedores', 'documentos-devedores', false, 15728640, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv', 'text/markdown', 'text/html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/octet-stream'
])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- (depois das tabelas do Jurídico: função SQL é validada na criação)
-- Vínculos do cliente, para a Zona de risco: o que existe e o que impede a exclusão definitiva.
create or replace function fn_vinculos_devedor(p_devedor_id bigint)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'telefones',        (select count(*) from telefones_devedor where devedor_id = p_devedor_id),
    'ocorrencias',      (select count(*) from ocorrencias where devedor_id = p_devedor_id),
    'agenda',           (select count(*) from agenda where devedor_id = p_devedor_id),
    'conversas',        (select count(*) from conversas where devedor_id = p_devedor_id),
    'mensagens',        (select count(*) from mensagens m join conversas c on c.id = m.conversa_id where c.devedor_id = p_devedor_id),
    'acordos',          (select count(*) from acordos where devedor_id = p_devedor_id),
    'pagamentos',       (select count(*) from pagamentos where devedor_id = p_devedor_id and not coalesce(simulacao, false)),
    'juridico_analises',(select count(*) from juridico_analises where devedor_id = p_devedor_id),
    'juridico_casos',   (select count(*) from juridico_casos where devedor_id = p_devedor_id),
    'documentos',       (select count(*) from devedor_documentos where devedor_id = p_devedor_id),
    -- o "não perturbe" mora em bloqueios_contato, que sai junto com o devedor: apagar quem pediu
    -- para parar faria uma nova importação do mesmo CPF voltar a chamá-lo (ADR-0003, R4)
    'bloqueios',        (select count(*) from bloqueios_contato where devedor_id = p_devedor_id)
  );
$$;

-- ============================================================
-- 7.7) Fila da carteira: acionáveis e não acionáveis (as planilhas da V5.5.12/13)
-- ============================================================
-- Universo: quem está na carteira, ativo e ainda não pagou. Acionável = dá para chamar agora;
-- o motivo do não acionável é o que a equipe precisa resolver (higienizar, conferir, acompanhar).
-- A ordem é a da carteira (ordem_fila), a mesma do robô.
create or replace function fn_fila_carteira(p_carteira_id bigint)
returns table (
  devedor_id bigint, acionavel boolean, condicao text, processo text, nome text, cpf_cnpj text, saldo numeric,
  vencimento date, dias_atraso int, situacao text, telefones text, whatsapp text, proxima_acao text,
  ultimo_contato_em timestamptz, responsavel text, marcadores text, observacao text
)
language sql
stable
set search_path = public
as $$
  with base as (
    select d.id, d.processo, d.nome, d.cpf_cnpj, d.saldo, d.vencimento, d.status_cobranca, d.ultimo_contato_em,
           d.responsavel_id, d.tags, d.motivo_inadimplencia, d.prioridade, c.ordem_fila
      from devedores d
      join carteiras c on c.id = d.carteira_id
     where d.carteira_id = p_carteira_id and d.inativo_em is null and d.status_cobranca <> 'pago'
  ),
  fones as (
    select t.devedor_id,
           count(*) as total,
           count(*) filter (where t.tipo = 'movel') as celulares,
           count(*) filter (where t.tipo = 'movel' and (t.whatsapp_valido is null or t.whatsapp_valido)) as elegiveis,
           string_agg(t.telefone_e164 || case when t.ordem = 1 then ' [principal]' else '' end, ' | ' order by t.ordem, t.id) as lista,
           string_agg(t.telefone_e164 || ': ' || case when t.whatsapp_valido then 'tem WhatsApp'
                                                       when t.whatsapp_valido = false then 'sem WhatsApp'
                                                       else 'não verificado' end, ' | ' order by t.ordem, t.id) as wa
      from telefones_devedor t
     where t.excluido_em is null and t.devedor_id in (select id from base)
     group by t.devedor_id
  ),
  classe as (
    select b.*, f.lista, f.wa,
           case
             when b.status_cobranca = 'nao_perturbe' or exists (select 1 from bloqueios_contato x where x.devedor_id = b.id)
               then 'Pediu para não ser contatado'
             when b.status_cobranca = 'arquivado' then 'Arquivado (falecido ou encerrado)'
             when b.status_cobranca = 'contestado' then 'Contestou a dívida: conferir antes de cobrar'
             when exists (select 1 from acordos a where a.devedor_id = b.id and a.status = 'ativo')
               then 'Acordo ativo: acompanhar as parcelas'
             when coalesce(f.total, 0) = 0 then 'Higienizar contato: sem telefone'
             when coalesce(f.celulares, 0) = 0 then 'Higienizar contato: só telefone fixo'
             when coalesce(f.elegiveis, 0) = 0 then 'Higienizar contato: nenhum celular com WhatsApp'
           end as motivo
      from base b
      left join fones f on f.devedor_id = b.id
  )
  select k.id, k.motivo is null, coalesce(k.motivo, 'Acionável agora'), k.processo, k.nome, k.cpf_cnpj, k.saldo,
         k.vencimento, greatest(0, ((now() at time zone 'America/Sao_Paulo')::date - k.vencimento))::int,
         k.status_cobranca::text, k.lista, k.wa,
         (select case g.tipo when 'promessa' then 'Promessa ' else 'Retorno ' end
                 || to_char(g.quando at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
            from agenda g where g.devedor_id = k.id and g.status = 'pendente' order by g.quando limit 1),
         k.ultimo_contato_em,
         (select u.nome from usuarios_app u where u.id = k.responsavel_id),
         k.tags, k.motivo_inadimplencia
    from classe k
   order by (case when k.ordem_fila = 'antigos' then k.vencimento end) asc nulls last,
            (case when k.ordem_fila = 'recentes' then k.vencimento end) desc nulls last,
            k.prioridade desc, k.id;
$$;

create or replace function fn_fila_carteira_resumo(p_carteira_id bigint)
returns jsonb
language sql
stable
set search_path = public
as $$
  with f as (select acionavel, condicao from fn_fila_carteira(p_carteira_id))
  select jsonb_build_object(
    'acionaveis', (select count(*) from f where acionavel),
    'nao_acionaveis', (select count(*) from f where not acionavel),
    'motivos', coalesce((select jsonb_object_agg(condicao, n) from (select condicao, count(*) n from f where not acionavel group by condicao) m), '{}'::jsonb)
  );
$$;

revoke execute on function fn_fila_carteira(bigint) from public, anon, authenticated;
revoke execute on function fn_fila_carteira_resumo(bigint) from public, anon, authenticated;
grant execute on function fn_fila_carteira(bigint) to service_role;
grant execute on function fn_fila_carteira_resumo(bigint) to service_role;

-- ============================================================
-- 8) RLS: leitura pelo escopo; escrita só pela API (service role)
-- ============================================================
alter table auditoria               enable row level security;
alter table metas_produtividade     enable row level security;
alter table juridico_fontes         enable row level security;
alter table juridico_fontes_versoes enable row level security;
alter table juridico_precedentes    enable row level security;
alter table devedor_documentos      enable row level security;
alter table juridico_analises       enable row level security;
alter table juridico_casos          enable row level security;

-- auditoria e metas: sem policy para authenticated — as telas leem pelo servidor, depois de
-- conferir o papel de quem pede.

drop policy if exists juridico_fontes_select on juridico_fontes;
create policy juridico_fontes_select on juridico_fontes for select to authenticated using (true);
drop policy if exists juridico_fontes_versoes_select on juridico_fontes_versoes;
create policy juridico_fontes_versoes_select on juridico_fontes_versoes for select to authenticated using (true);
drop policy if exists juridico_precedentes_select on juridico_precedentes;
create policy juridico_precedentes_select on juridico_precedentes for select to authenticated using (true);

drop policy if exists devedor_documentos_select on devedor_documentos;
create policy devedor_documentos_select on devedor_documentos for select to authenticated
  using (devedor_id in (select fn_devedores_visiveis()));
drop policy if exists juridico_analises_select on juridico_analises;
create policy juridico_analises_select on juridico_analises for select to authenticated
  using (devedor_id in (select fn_devedores_visiveis()));
drop policy if exists juridico_casos_select on juridico_casos;
create policy juridico_casos_select on juridico_casos for select to authenticated
  using (devedor_id in (select fn_devedores_visiveis()));

revoke insert, update, delete on auditoria, metas_produtividade, juridico_fontes, juridico_fontes_versoes,
  juridico_precedentes, devedor_documentos, juridico_analises, juridico_casos from anon, authenticated;
revoke select on auditoria, metas_produtividade from anon, authenticated;
grant select on juridico_fontes, juridico_fontes_versoes, juridico_precedentes, devedor_documentos,
  juridico_analises, juridico_casos to authenticated;
grant all on auditoria, metas_produtividade, juridico_fontes, juridico_fontes_versoes, juridico_precedentes,
  devedor_documentos, juridico_analises, juridico_casos to service_role;

revoke execute on function fn_inativar_devedor(bigint, uuid, text) from public, anon, authenticated;
revoke execute on function fn_reativar_devedor(bigint) from public, anon, authenticated;
revoke execute on function fn_vinculos_devedor(bigint) from public, anon, authenticated;
grant execute on function fn_inativar_devedor(bigint, uuid, text) to service_role;
grant execute on function fn_reativar_devedor(bigint) to service_role;
grant execute on function fn_vinculos_devedor(bigint) to service_role;
