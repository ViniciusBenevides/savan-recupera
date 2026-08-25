-- Reabre o conector do chip: a Meta Cloud API deixou de ser o único caminho.
-- A WABA da MC CRED está banida permanentemente desde 17/08/2026 (contexto-projeto.md §38), e a
-- operação passa a rodar sobre Evolution/Baileys. O código da Meta continua inteiro: o valor
-- 'meta_cloud' segue aceito para o dia em que houver uma conta oficial de novo.
-- Idempotente: pode rodar duas vezes seguidas.

-- 1) chips.conector volta a aceitar dois valores, com baileys como padrão -------------------
alter table chips drop constraint if exists chips_conector_check;
alter table chips add constraint chips_conector_check
  check (conector in ('baileys', 'meta_cloud'));
alter table chips alter column conector set default 'baileys';

comment on column chips.conector is
  'Transporte do chip: baileys (Evolution API, padrão) ou meta_cloud (API oficial, suspensa — ver §38).';

-- 2) O nome da instância na Evolution que representa este chip ------------------------------
-- Uma instância da Evolution = um número. A credencial de sessão (chaves Signal) NUNCA vem para
-- cá: ela mora no Postgres da própria Evolution. Aqui guardamos só o identificador.
alter table chips add column if not exists instancia_evolution text;

comment on column chips.instancia_evolution is
  'Nome da instância na Evolution API que atende este chip. NÃO é credencial — a sessão do WhatsApp '
  'vive no banco da Evolution. Nulo em chip papel=equipe e em chip meta_cloud.';

create unique index if not exists chips_instancia_evolution_key
  on chips (instancia_evolution)
  where instancia_evolution is not null;
