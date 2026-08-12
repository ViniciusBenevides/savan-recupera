-- A espera do n8n vale dentro de uma execucao. Este relogio persiste a cadencia do chip entre
-- execucoes distintas do W01, impedindo que o schedule de 5 min antecipe o proximo disparo.
alter table public.chips
  add column if not exists proximo_disparo_em timestamptz;

create index if not exists idx_chips_proximo_disparo
  on public.chips (proximo_disparo_em)
  where proximo_disparo_em is not null;

comment on column public.chips.proximo_disparo_em is
  'Reserva de cadencia da campanha; nenhum novo lote deste chip sai antes deste instante.';
