-- Devolve à fila quem morreu por falha NOSSA, não por problema do devedor.
--
-- Aplicar com:  bash scripts/supabase-sql.sh supabase/migrations/20260903140000_devolver_fila_falha_nossa.sql
--
-- ── O que quebrou ──────────────────────────────────────────────────────────────────────────
-- O `campanha-registrar` tratava TODO status diferente de `enviado`/`sem_whatsapp` no mesmo `else`:
-- gravava `falha`, que é terminal. O item nunca mais é sorteado pelo `fn_selecionar_lote`.
--
-- Quando a causa é do nosso lado, isso perde a pessoa por um problema que não era dela. Em
-- 03/09/2026 a sessão do chip 1 foi revogada às 16:59 do dia 02 (401, `conflict/device_removed`).
-- A AMANDA foi a primeira sorteada depois disso: o envio voltou `chip_caido` e o item morreu.
-- Com o chip de volta ela continuaria parada para sempre.
--
-- Corrigido na função (publicada em 03/09/2026): erro da nossa lista fechada volta para
-- `aguardando` com espera crescente, até um teto de 5 tentativas. Falta desfazer o acumulado.
--
-- ── Por que a lista é fechada ──────────────────────────────────────────────────────────────
-- Só volta erro em que é CERTO que nada saiu. Requeue de um envio que talvez tenha ido embora
-- manda a abordagem duas vezes para a mesma pessoa — padrão de robô, e é o que queima número (§31).
-- `resposta_sem_id` fica de fora justamente por isso: ali o WhatsApp pode ter entregue e só o
-- Chatwoot não devolveu id.
--
-- A conversa-casca (linha em `conversas` sem mensagem) NÃO é apagada aqui, ao contrário do reparo
-- de `sem_whatsapp`: o item volta para a fila, e a próxima tentativa escreve nessa mesma conversa.
-- Apagar criaria churn e um ponteiro novo no Chatwoot sem necessidade.

-- ── 1) De volta para a fila ────────────────────────────────────────────────────────────────
-- Guardas: carteira ativa, sem bloqueio de contato (ADR-0003 — o "não" vale para sempre e para
-- todos os chips), e nenhum item vivo ou já enviado para a mesma pessoa, para não duplicar.
update fila_envios f
set status = 'aguardando',
    chip_id = null,
    agendado_para = null,
    tentativas = greatest(coalesce(f.tentativas, 0), 1)
from devedores d
join carteiras c on c.id = d.carteira_id and c.status = 'ativa'
where f.devedor_id = d.id
  and f.status = 'falha'
  and f.erro in (
    'chip_caido', 'retentar', 'chip_nao_encontrado', 'chip_de_equipe',
    'canal_meta_suspenso', 'sem_instancia_evolution', 'evolution_nao_configurada'
  )
  and f.simulacao is not true
  and not exists (
    select 1 from bloqueios_contato b where b.devedor_id = f.devedor_id
  )
  and not exists (
    select 1 from fila_envios f2
    where f2.devedor_id = f.devedor_id
      and f2.id <> f.id
      and f2.status in ('aguardando', 'processando', 'enviado')
  );

-- ── 2) Quem voltou para a fila não está mais desistido ─────────────────────────────────────
update devedores d
set status_cobranca = 'na_fila'
where d.status_cobranca in ('sem_whatsapp', 'pendente')
  and exists (
    select 1 from fila_envios f where f.devedor_id = d.id and f.status = 'aguardando'
  );

-- ── 3) Conferência ─────────────────────────────────────────────────────────────────────────
select
  (select count(*) from fila_envios
     where status = 'falha'
       and erro in ('chip_caido', 'retentar', 'chip_nao_encontrado', 'chip_de_equipe',
                    'canal_meta_suspenso', 'sem_instancia_evolution', 'evolution_nao_configurada')
  ) as falhas_nossas_restantes,
  (select count(*) from fila_envios where status = 'aguardando') as na_fila,
  (select count(*) from fila_envios where status = 'falha') as falhas_totais;
