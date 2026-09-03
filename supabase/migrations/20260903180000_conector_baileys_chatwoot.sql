-- Libera o terceiro conector (baileys_chatwoot) e migra o chip 1 para ele.
--
-- Aplicar com:  bash scripts/supabase-sql.sh supabase/migrations/20260903180000_conector_baileys_chatwoot.sql
--
-- ── Por que existe ────────────────────────────────────────────────────────────────────────
-- Em 03/09/2026 a sessão do chip 1 caiu na Evolution (401, `conflict/device_removed`) e, depois
-- de várias tentativas de QR (nossas e do painel, sem coordenação), o WhatsApp passou a recusar
-- novo pareamento nesse número por um tempo (§8 do guia do Baileys — tentativas demais em pouco
-- tempo é o padrão que a proteção deles lê como automação).
--
-- O mesmo número pareou de primeira pelo canal Baileys nativo do Chatwoot self-hosted
-- (`baileys-api`, fazer-ai) — um segundo serviço que já rodava ao lado do Chatwoot, sem uso até
-- hoje. Exposto publicamente (Coolify + registro DNS em virtusdoctor.com) e ligado como segundo
-- provedor: `chips.conector = 'baileys_chatwoot'` fala com ele; `'baileys'` continua falando com a
-- Evolution. Mesma semântica de negócio (ritmo, opt-in, texto do bloco de disparo) — só o
-- transporte muda. Ver `_shared/conector.ts` e `_shared/baileys-api-client.ts`.

-- ── 1) Amplia o CHECK — sem isso o UPDATE abaixo é recusado pelo banco ──────────────────────
alter table chips drop constraint chips_conector_check;
alter table chips add constraint chips_conector_check
  check (conector = any (array['baileys', 'baileys_chatwoot', 'meta_cloud']));

-- ── 2) Migra o chip 1 ────────────────────────────────────────────────────────────────────────
-- `instancia_evolution` fica como estava (registro histórico de qual instância morta era essa) —
-- não é apagado, só deixa de ser o identificador usado: para `baileys_chatwoot` o identificador é
-- o próprio `numero_e164` do chip, que já está cadastrado e é o que a API do baileys-api espera
-- no path da conexão.
update chips
set conector = 'baileys_chatwoot',
    status = 'conectado'
where id = 14 and numero_e164 is not null;

-- ── 3) Conferência ─────────────────────────────────────────────────────────────────────────
select id, nome, conector, status, numero_e164, instancia_evolution from chips where id = 14;
