-- Remove as conversas-casca deixadas por números sem WhatsApp.
--
-- Aplicar com:  bash scripts/supabase-sql.sh supabase/migrations/20260902200000_limpar_conversas_casca.sql
--
-- ── Por que existem ────────────────────────────────────────────────────────────────────────
-- O `contato-criar` abre contato E conversa no Chatwoot ANTES de qualquer tentativa de envio. Só
-- depois a Evolution responde `{ok:false, resultado:"sem_whatsapp"}`. Sobra uma conversa sem
-- nenhuma mensagem: no Chatwoot e, pelo webhook do `chatwoot-sync`, também em `conversas`.
--
-- Para o operador é uma pessoa na caixa de entrada com quem ninguém nunca falou e para quem não dá
-- para escrever. Foi o que apareceu com a JEANETE em 02/09/2026.
--
-- A partir de agora o `campanha-registrar` limpa isso sozinho no ramo `sem_whatsapp` (apaga a linha
-- vazia e resolve a conversa no Chatwoot). Este arquivo cuida do que ficou para trás.
--
-- ── Por que apagar e não encerrar ──────────────────────────────────────────────────────────
-- A linha não guarda informação nenhuma: que o número não tem WhatsApp já está em
-- `fila_envios.status` e em `telefones_devedor.whatsapp_valido`. E encerrar seria pior — a adoção
-- do `chatwoot-sync` reaproveita a linha mais recente do devedor, então uma casca marcada
-- `encerrada` seria herdada quando a pessoa respondesse por OUTRO número, e o desfecho errado
-- calaria o robô.
--
-- Conversa de teste (`simulacao`) fica de fora, como no resto dos reparos de hoje.

delete from conversas c
where not exists (select 1 from mensagens m where m.conversa_id = c.id)
  and c.simulacao is not true
  -- só casca comprovada: o devedor tem um item encerrado por falta de WhatsApp
  and exists (
    select 1 from fila_envios f
    where f.devedor_id = c.devedor_id and f.status = 'sem_whatsapp'
  )
  -- guarda contra corrida: conversa recém-criada pode estar a segundos da primeira mensagem
  and c.criado_em < now() - interval '15 minutes';

-- ── Conferência ────────────────────────────────────────────────────────────────────────────
select
  (select count(*) from conversas c
     where not exists (select 1 from mensagens m where m.conversa_id = c.id)
       and c.simulacao is not true) as cascas_reais_restantes,
  (select count(*) from conversas c
     where not exists (select 1 from mensagens m where m.conversa_id = c.id)
       and c.simulacao is true) as cascas_de_teste_preservadas,
  (select count(*) from conversas where simulacao is not true) as conversas_reais;
