-- Atendimento humano dentro do painel (§ aba Conversas).
-- Antes o operador lia a conversa aqui e respondia no Chatwoot. Estas colunas sustentam
-- responder pela propria caixa de entrada: nota interna, autoria, quem assumiu, o que ja
-- foi lido e a hora da ultima mensagem DO CONTATO (a que abre a janela de 24h da Meta).

-- ── Mensagens ────────────────────────────────────────────────────────────────────────────
alter table public.mensagens
  add column if not exists privado boolean not null default false,
  add column if not exists autor_id uuid,
  add column if not exists autor_nome text;

comment on column public.mensagens.privado is
  'Nota interna (private no Chatwoot): a equipe ve, o contato nunca recebe.';
comment on column public.mensagens.autor_id is
  'Usuario do painel que escreveu, quando origem = humano.';
comment on column public.mensagens.autor_nome is
  'Nome exibido do autor no momento do envio (historico nao muda se o cadastro mudar).';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mensagens_autor_id_fkey'
  ) then
    alter table public.mensagens
      add constraint mensagens_autor_id_fkey foreign key (autor_id)
      references public.usuarios_app (id) on delete set null;
  end if;
end $$;

-- FK sem indice vira seq scan em toda remocao de usuario e em qualquer join por autor.
create index if not exists idx_mensagens_autor
  on public.mensagens (autor_id) where autor_id is not null;

-- A thread carrega notas junto com as mensagens; o indice de conversa ja cobre a leitura.
-- Este parcial serve o caso oposto: auditar so as notas internas, que sao poucas.
create index if not exists idx_mensagens_privadas
  on public.mensagens (conversa_id, criado_em) where privado;

-- ── Conversas ────────────────────────────────────────────────────────────────────────────
alter table public.conversas
  add column if not exists atendente_id uuid,
  add column if not exists atendente_nome text,
  add column if not exists assumida_em timestamptz,
  add column if not exists lida_em timestamptz,
  add column if not exists ultima_entrada_em timestamptz;

comment on column public.conversas.atendente_id is
  'Operador que assumiu a conversa do robo (estado = humano).';
comment on column public.conversas.lida_em is
  'Ultima vez que um operador abriu a conversa no painel; alimenta o marcador de nao lida.';
comment on column public.conversas.ultima_entrada_em is
  'Hora da ultima mensagem DO CONTATO. E o relogio da janela de 24h da Cloud API: fora dela '
  'a Meta so aceita modelo aprovado, entao a caixa de entrada bloqueia texto livre.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversas_atendente_id_fkey'
  ) then
    alter table public.conversas
      add constraint conversas_atendente_id_fkey foreign key (atendente_id)
      references public.usuarios_app (id) on delete set null;
  end if;
end $$;

create index if not exists idx_conversas_atendente
  on public.conversas (atendente_id) where atendente_id is not null;

-- Fila "precisam de resposta": conversa cuja ultima mensagem chegou depois da ultima leitura.
create index if not exists idx_conversas_nao_lidas
  on public.conversas (ultima_msg_em desc)
  where ultima_msg_de = 'devedor';

-- ── Janela de 24h: manter `ultima_entrada_em` sem depender de quem escreveu a mensagem ───
-- Tres caminhos gravam em `mensagens` (chatwoot-sync, bot-turno e agora o painel). Um gatilho
-- e o unico lugar que os tres respeitam de graca.
create or replace function public.fn_touch_ultima_entrada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversas
     set ultima_entrada_em = new.criado_em
   where id = new.conversa_id
     and (ultima_entrada_em is null or ultima_entrada_em < new.criado_em);
  return null;
end;
$$;

revoke execute on function public.fn_touch_ultima_entrada() from public, anon, authenticated;

drop trigger if exists trg_touch_ultima_entrada on public.mensagens;
create trigger trg_touch_ultima_entrada
  after insert or update of criado_em, direcao on public.mensagens
  for each row
  when (new.direcao = 'entrada' and new.privado is not true)
  execute function public.fn_touch_ultima_entrada();

-- Backfill: sem isto toda conversa antiga apareceria como "fora da janela" ate a proxima
-- mensagem do contato.
update public.conversas c
   set ultima_entrada_em = m.ultima
  from (
    select conversa_id, max(criado_em) as ultima
      from public.mensagens
     where direcao = 'entrada'
     group by conversa_id
  ) m
 where m.conversa_id = c.id
   and (c.ultima_entrada_em is null or c.ultima_entrada_em < m.ultima);

-- ── Realtime ─────────────────────────────────────────────────────────────────────────────
-- A caixa de entrada ja assinava `mensagens`, mas a tabela nunca esteve na publicacao: so o
-- polling de 7s funcionava. Com atendimento humano a resposta precisa aparecer na hora.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensagens'
  ) then
    alter publication supabase_realtime add table public.mensagens;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversas'
  ) then
    alter publication supabase_realtime add table public.conversas;
  end if;
end $$;
