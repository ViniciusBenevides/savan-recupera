-- 024 — Hardening de segurança (auditoria 2026-06-26)
-- (renumerado de 023 → 024 para não colidir com 023_intervalo_aleatorio_tamanho.sql; ver §28/§29)
-- Aplicado em produção via MCP apply_migration (projeto wmggqsmqvklxlqwsksjs).
--
-- C1 (CRÍTICO): escalonamento de privilégio via usuarios_app.
--   A policy de UPDATE permitia ao cobrador editar usuários do seu tenant SEM trava de coluna,
--   podendo setar role='admin' direto via PostgREST (anon key pública), contornando a API.
--   Correção: toda ESCRITA em usuarios_app passa a exigir service_role (a API já usa).
--   O role 'authenticated' mantém apenas SELECT (necessário para getSessao ler o próprio papel).
revoke insert, update, delete on table public.usuarios_app from authenticated, anon;

-- M3 (MÉDIO): tabelas lidas apenas pelo service_role. O RLS já negava (testado: 0 linhas),
--   mas o GRANT amplo padrão do Supabase permanecia. Removido (defesa em profundidade).
revoke all on table public.segredos           from authenticated, anon;
revoke all on table public.chips_credenciais  from authenticated, anon;
revoke all on table public.bot_locks          from authenticated, anon;
revoke all on table public.bot_fila_mensagens from authenticated, anon;
