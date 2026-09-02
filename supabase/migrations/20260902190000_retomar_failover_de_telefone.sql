-- Devolve à fila as pessoas que foram desistidas por um failover que nunca funcionou.
--
-- Aplicar com:  bash scripts/supabase-sql.sh supabase/migrations/20260902190000_retomar_failover_de_telefone.sql
--
-- ── O que quebrou ──────────────────────────────────────────────────────────────────────────
-- `fn_proximo_telefone` é `RETURNS telefones_devedor` — UMA linha, não SETOF. Pelo PostgREST isso
-- chega ao `campanha-registrar` como OBJETO, e o teste era `prox.length`, que num objeto é
-- `undefined`. O ramo do failover nunca executava: em vez de enfileirar o segundo número da
-- pessoa, o código caía no `else` e marcava o devedor como `sem_whatsapp`.
--
-- Somado a isso, o W01 mandava o `resultado: "sem_whatsapp"` da Evolution como `status: "falha"`,
-- então em parte dos casos o ramo do failover nem era alcançado.
--
-- Ambos corrigidos em 02/09/2026 (função publicada + nós do W01). Falta desfazer o acumulado:
-- 31 devedores marcados `sem_whatsapp` que ainda têm um móvel nunca tentado e nenhum item na fila,
-- mais 2 itens que morreram como `falha`.
--
-- ── O que este arquivo faz ─────────────────────────────────────────────────────────────────
-- Exatamente o que o código corrigido faria: carimba o número que falhou, corrige o status do
-- item e enfileira o PRÓXIMO móvel da pessoa. Nada de abordagem imediata — o item entra como
-- `aguardando` e respeita o ritmo do chip, que é de um envio por hora.

-- ── 1) Carimba os números que a Evolution recusou ───────────────────────────────────────────
-- Sem isso `fn_proximo_telefone` continua elegendo o mesmo número: ela só filtra
-- `whatsapp_valido is null or true`, e o `p_excluir` vale para uma chamada só.
update telefones_devedor t
set whatsapp_valido = false, verificado_em = now()
from fila_envios f
where f.telefone_id = t.id
  and t.whatsapp_valido is null
  and (
    (f.status = 'sem_whatsapp')
    or (f.status = 'falha' and f.erro = 'sem_whatsapp')
  );

-- ── 2) O item que morreu como `falha` era `sem_whatsapp` ────────────────────────────────────
-- Corrige o rótulo para o painel não mostrar erro de envio onde houve número sem WhatsApp.
update fila_envios
set status = 'sem_whatsapp', erro = 'on_whatsapp_false'
where status = 'falha' and erro = 'sem_whatsapp';

-- ── 3) Enfileira o próximo móvel de quem ficou sem ──────────────────────────────────────────
-- Só entra quem: já teve um item encerrado por falta de WhatsApp, NÃO tem nenhum item vivo hoje,
-- não está bloqueado (ADR-0003), e ainda tem um móvel elegível. A carteira precisa estar ativa —
-- o `fn_selecionar_lote` já exige isso, mas enfileirar item que nunca será pego é lixo.
insert into fila_envios (devedor_id, telefone_id, carteira_id, prioridade, status, simulacao)
select d.id, prox.id, d.carteira_id, 0, 'aguardando', false
from devedores d
join carteiras c on c.id = d.carteira_id and c.status = 'ativa'
cross join lateral (
  select t.id from telefones_devedor t
  where t.devedor_id = d.id
    and t.tipo = 'movel'
    and (t.whatsapp_valido is null or t.whatsapp_valido = true)
  order by t.ordem, t.id
  limit 1
) prox
where exists (
    select 1 from fila_envios f
    where f.devedor_id = d.id and f.status = 'sem_whatsapp'
  )
  and not exists (
    select 1 from fila_envios f2
    where f2.devedor_id = d.id and f2.status in ('aguardando', 'processando', 'enviado')
  )
  and not exists (
    select 1 from bloqueios_contato b where b.devedor_id = d.id
  );

-- ── 4) Quem voltou para a fila não está mais desistido ──────────────────────────────────────
update devedores d
set status_cobranca = 'na_fila'
where d.status_cobranca = 'sem_whatsapp'
  and exists (
    select 1 from fila_envios f where f.devedor_id = d.id and f.status = 'aguardando'
  );

-- ── 5) Conferência ─────────────────────────────────────────────────────────────────────────
select
  (select count(*) from devedores where status_cobranca = 'sem_whatsapp') as ainda_desistidos,
  (select count(*) from devedores d
    where d.status_cobranca = 'sem_whatsapp'
      and exists (select 1 from telefones_devedor t where t.devedor_id = d.id and t.tipo = 'movel'
                    and (t.whatsapp_valido is null or t.whatsapp_valido = true))
  ) as desistidos_com_movel_sobrando,
  (select count(*) from fila_envios where status = 'aguardando') as na_fila,
  (select count(*) from fila_envios where status = 'falha' and erro = 'sem_whatsapp') as falhas_mal_rotuladas;
