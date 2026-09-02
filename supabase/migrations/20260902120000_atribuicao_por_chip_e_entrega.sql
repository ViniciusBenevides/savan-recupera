-- Quem mandou cada mensagem, e se ela chegou.
--
-- O problema que isto resolve: `mensagens` não tinha chip. A tela atribuía tudo pelo
-- `conversas.chip_id`, que é MUTÁVEL — o `fn_reatribuir_chip` (015) reescreve essa coluna quando um
-- chip cai. Depois do ban da conta oficial (§38) as conversas do número banido passaram para o chip
-- Baileys, e a caixa de entrada passou a mostrar 430 conversas do número morto como se fossem do
-- chip novo, incluindo 193 abordagens de 01/09 que na verdade FALHARAM na inbox banida.
--
-- Duas colunas consertam a raiz:
--   • `mensagens.chip_id`  — congela o transporte no momento do envio; reatribuição não reescreve.
--   • `conversas.chatwoot_inbox_id` — em qual inbox do Chatwoot o ponteiro da conversa vive. Sem
--     isso não dá para saber que `chatwoot_conversation_id = 704` aponta para o canal banido.
--
-- Idempotente: pode rodar duas vezes seguidas.

-- ── 1. Em qual inbox do Chatwoot a conversa está pendurada ────────────────────────────────
alter table conversas add column if not exists chatwoot_inbox_id int;

comment on column conversas.chatwoot_inbox_id is
  'Inbox do Chatwoot onde `chatwoot_conversation_id` vive. Reatribuir chip NÃO move o ponteiro: '
  'sem esta coluna, uma conversa do canal banido parece atendível pelo chip novo e o envio falha '
  'em silêncio (§38).';

create index if not exists idx_conversas_chatwoot_inbox
  on conversas (chatwoot_inbox_id) where chatwoot_inbox_id is not null;

-- ── 2. O chip que carregou cada mensagem ──────────────────────────────────────────────────
alter table mensagens add column if not exists chip_id bigint references chips (id);

comment on column mensagens.chip_id is
  'Chip que efetivamente carregou (ou tentou carregar) esta mensagem. Congelado no INSERT pelo '
  'trigger `trg_mensagens_chip`. NÃO derive isto de `conversas.chip_id` na leitura: aquela coluna '
  'muda no failover e reescreveria a história.';

create index if not exists idx_mensagens_chip on mensagens (chip_id, criado_em)
  where chip_id is not null;

-- Carimba o chip no momento do INSERT. É trigger e não mudança nos 12 pontos de inserção de
-- propósito: `bot-turno` sozinho tem 7 deles, e um esquecido volta a produzir mensagem órfã.
-- Quem já sabe o chip (o painel, ao responder) pode passar explicitamente — o trigger não sobrescreve.
create or replace function fn_mensagens_carimbar_chip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.chip_id is null then
    select c.chip_id into new.chip_id from conversas c where c.id = new.conversa_id;
  end if;
  return new;
end;
$$;

-- `security definer` porque `conversas` tem RLS: sem isso a busca do chip volta vazia para quem
-- insere fora do service_role. Chamada direta fica fechada, como nas demais funções do projeto.
revoke execute on function fn_mensagens_carimbar_chip() from public, anon, authenticated;

drop trigger if exists trg_mensagens_chip on mensagens;
create trigger trg_mensagens_chip
  before insert on mensagens
  for each row execute function fn_mensagens_carimbar_chip();

-- ── 3. "Falhou" precisa caber no recibo de entrega ────────────────────────────────────────
-- A escala original (20260825150000) era 1..4, copiada do `messages.update` do Baileys, e não tinha
-- como representar a recusa do provedor. Sem o 0, as 193 mensagens que o Chatwoot marcou `failed`
-- ficam indistinguíveis de "ainda sem recibo" — que é exatamente por que ninguém viu o problema.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'mensagens_status_entrega_check') then
    alter table mensagens drop constraint mensagens_status_entrega_check;
  end if;
  alter table mensagens add constraint mensagens_status_entrega_check
    check (status_entrega is null or status_entrega between 0 and 4);
end
$$;

comment on column mensagens.status_entrega is
  'Recibo do provedor: 0 falhou, 1 enviado, 2 entregue, 3 lido, 4 reproduzido. Nulo = sem recibo. '
  'É a base do índice de saúde do chip — "enviado" (1) não é entrega, ver §31.';

-- ── 4. Backfill do inbox de cada conversa ─────────────────────────────────────────────────
-- As faixas foram conferidas contra a API do Chatwoot em 02/09/2026, conversa por conversa:
-- inbox 8 (`Channel::Whatsapp`, WABA banida) = 427..939 · inbox 9 (`Channel::Api`, Evolution) = 940..945.
-- As 81 conversas de junho com id < 427 apontam para conversas que não existem mais em nenhuma
-- das duas inboxes; ficam nulas em vez de receber um palpite.
update conversas set chatwoot_inbox_id = 8
where chatwoot_inbox_id is null and chatwoot_conversation_id between 427 and 939;

update conversas set chatwoot_inbox_id = 9
where chatwoot_inbox_id is null and chatwoot_conversation_id between 940 and 945;

-- ── 5. Backfill do chip de cada mensagem ──────────────────────────────────────────────────
-- A mensagem pertence ao chip cuja INBOX a carregou, não ao chip que hoje segura a conversa. Para
-- as 193 de 01/09 isso significa o chip oficial: elas saíram (e morreram) pelo número banido, que é
-- o número que teria aparecido para o destinatário.
update mensagens m
set chip_id = (
  select ch.id from chips ch
  where ch.chatwoot_inbox_id = c.chatwoot_inbox_id
  order by ch.id limit 1
)
from conversas c
where m.conversa_id = c.id
  and m.chip_id is null
  and c.chatwoot_inbox_id is not null
  and exists (select 1 from chips ch where ch.chatwoot_inbox_id = c.chatwoot_inbox_id);
