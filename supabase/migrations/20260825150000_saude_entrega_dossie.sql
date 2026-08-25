-- Fatia 3 — o recibo de entrega vira dado de primeira classe.
--
-- Com a WABA banida (§38), o semáforo de qualidade GREEN/YELLOW/RED da Meta acabou. O canal
-- Baileys não tem substituto oficial: o sinal mais honesto disponível é a proporção de mensagens
-- que efetivamente chegam ao destinatário. O §31 provou isso na prática — numa conta já restrita o
-- WhatsApp ACEITA e DESCARTA em silêncio, então "enviado" nunca foi prova de entrega.
--
-- Idempotente: pode rodar duas vezes seguidas.

-- Status de entrega reportado pelo WhatsApp, no mesmo código que o Baileys usa em messages.update:
--   1 = enviado · 2 = entregue · 3 = lido · 4 = reproduzido
alter table mensagens add column if not exists status_entrega smallint;
alter table mensagens add column if not exists entregue_em timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mensagens_status_entrega_check'
  ) then
    alter table mensagens add constraint mensagens_status_entrega_check
      check (status_entrega is null or status_entrega between 1 and 4);
  end if;
end
$$;

comment on column mensagens.status_entrega is
  'Recibo do WhatsApp: 1 enviado, 2 entregue, 3 lido, 4 reproduzido. Nulo = ainda sem recibo. '
  'É a base do índice de saúde do chip — "enviado" (1) não é entrega, ver §31.';

comment on column mensagens.entregue_em is
  'Quando o recibo de entrega (status 2) chegou. Nulo enquanto não chegou.';

-- A consulta de saúde olha só as saídas do robô: mensagem de humano tem outro padrão de entrega e
-- mensagem de entrada não tem recibo nosso. Índice parcial mantém isso barato.
create index if not exists idx_mensagens_entrega_bot
  on mensagens (conversa_id, criado_em)
  where direcao = 'saida' and origem = 'bot';
