-- Reparo dos dados deixados por dois defeitos corrigidos em 02/09/2026.
--
-- Aplicar com:  bash scripts/supabase-sql.sh supabase/migrations/20260902170000_juntar_conversas_duplicadas.sql
--
-- ── Defeito 1: `telefones_devedor.principal` nunca existiu ──────────────────────────────────
-- `canal-conversa.ts` e `chatwoot-sync` procuravam o telefone do devedor com
-- `.eq("principal", true)`. A coluna não existe (as reais são `ordem` e `tipo`), o Postgres
-- devolvia 42703, o cliente PostgREST devolvia `data: null` sem lançar exceção, e ninguém via.
-- Medido em 02/09/2026: 495 das 521 conversas reais (95%) ficaram com `telefone_id` nulo — todas
-- de devedores que TÊM telefone cadastrado, e todos com pelo menos um móvel. Nenhum caso legítimo.
-- Efeitos: o painel dizia "este devedor não tem telefone cadastrado" e escondia a caixa de envio;
-- e, pior, o `bot-turno` só marca `whatsapp_valido = false` e cancela a fila do número quando
-- `conversas.telefone_id` existe — ou seja, "não perturbe" e "pessoa errada" registravam o estado
-- na conversa mas NÃO travavam o número, que seguia na fila de abordagem.
--
-- ── Defeito 2: adoção barrada dentro da mesma inbox ─────────────────────────────────────────
-- `contato-criar` abre uma conversa NOVA no Chatwoot a cada abordagem, e `campanha-registrar`
-- move o ponteiro da linha para o id novo — o anterior fica órfão. Quando a pessoa respondia por
-- um órfão, o `chatwoot-sync` recusava adotar (filtrava por inbox diferente) e criava outra linha.
-- Como `etapa_roteiro` é por linha, o robô recomeçava o roteiro do zero. Em 02/09/2026 isso tinha
-- atingido 1 devedor real, com 4 linhas.
--
-- Este arquivo NÃO altera esquema: só junta o que rachou e preenche o que ficou nulo.
--
-- ── Por que só `simulacao = false` ──────────────────────────────────────────────────────────
-- As conversas de teste também têm duplicatas (32 devedores, 37 linhas em 02/09/2026), mas ali
-- elas são LEGÍTIMAS: cada rodada do `disparar-teste` abre uma conversa nova de propósito, para
-- validar o roteiro desde a abertura. Juntá-las embaralharia qual rodada produziu qual mensagem e
-- apagaria o histórico de teste do roteiro. E preencher `telefone_id` numa conversa de teste seria
-- pior ainda: o `disparar-teste` aponta para o NÚMERO DE TESTE, então herdar o telefone real do
-- devedor faria um "não perturbe" de teste invalidar o número real da pessoa — e abriria a caixa
-- de envio de uma conversa de teste apontando para o devedor de verdade.

-- ── 1) Junta as linhas duplicadas de conversa (só reais) ────────────────────────────────────
-- Sobrevive a mais ANTIGA de cada devedor (`min(id)`): é onde o roteiro começou e onde está o
-- histórico; as outras são recomeços. O critério é só o `id` de propósito — ele não muda entre os
-- passos abaixo, então repetir a subconsulta dá sempre o mesmo conjunto. Ranquear por quantidade
-- de mensagens seria instável: o passo 1.1 move mensagens e mudaria a resposta dos passos seguintes.

-- 1.1) Mensagens primeiro — a FK é `on delete cascade`. Apagar antes de mover perderia o histórico.
update mensagens m
set conversa_id = a.manter
from (
  select c.id as remover, g.manter
  from conversas c
  join (
    select devedor_id, min(id) as manter, count(*) as n
    from conversas where simulacao is not true group by devedor_id
  ) g on g.devedor_id = c.devedor_id
  where c.simulacao is not true and g.n > 1 and c.id <> g.manter
) a
where m.conversa_id = a.remover;

-- 1.2) `negociacoes` e `escalacoes` apontam com `on delete set null`: repontar para não perder o
--      vínculo silenciosamente. (Em 02/09/2026 nenhuma das linhas a remover tinha registro aqui,
--      mas o reparo tem de valer para qualquer duplicata que apareça depois.)
update negociacoes n
set conversa_id = a.manter
from (
  select c.id as remover, g.manter
  from conversas c
  join (
    select devedor_id, min(id) as manter, count(*) as n
    from conversas where simulacao is not true group by devedor_id
  ) g on g.devedor_id = c.devedor_id
  where c.simulacao is not true and g.n > 1 and c.id <> g.manter
) a
where n.conversa_id = a.remover;

update escalacoes e
set conversa_id = a.manter
from (
  select c.id as remover, g.manter
  from conversas c
  join (
    select devedor_id, min(id) as manter, count(*) as n
    from conversas where simulacao is not true group by devedor_id
  ) g on g.devedor_id = c.devedor_id
  where c.simulacao is not true and g.n > 1 and c.id <> g.manter
) a
where e.conversa_id = a.remover;

-- 1.3) Agora as linhas vazias podem sair. O `chatwoot_conversation_id` delas volta a ficar livre;
--      se a pessoa responder por uma dessas conversas do Chatwoot, o `chatwoot-sync` corrigido
--      adota a linha sobrevivente e move o ponteiro para lá.
delete from conversas c
using (
  select c2.id as remover
  from conversas c2
  join (
    select devedor_id, min(id) as manter, count(*) as n
    from conversas where simulacao is not true group by devedor_id
  ) g on g.devedor_id = c2.devedor_id
  where c2.simulacao is not true and g.n > 1 and c2.id <> g.manter
) a
where c.id = a.remover;

-- ── 2) Preenche `telefone_id` nas conversas reais que ficaram sem ───────────────────────────
-- Mesmo critério da importação e do código corrigido: o primeiro MÓVEL por `ordem`; sem móvel, o
-- primeiro da lista. Só toca em linha nula — nunca sobrescreve um telefone já escolhido.
--
-- Isto não é cosmético: é o que devolve efeito ao "não perturbe" e ao "pessoa errada" do
-- `bot-turno`, que dependem de `conversas.telefone_id` para travar o número.
update conversas c
set telefone_id = escolhido.id
from (
  select distinct on (devedor_id) devedor_id, id
  from telefones_devedor
  order by devedor_id, (coalesce(tipo, '') = 'movel') desc, ordem, id
) escolhido
where c.telefone_id is null
  and c.simulacao is not true
  and c.devedor_id = escolhido.devedor_id;

-- ── 3) Conferência ──────────────────────────────────────────────────────────────────────────
-- Depois de aplicar, as duas primeiras colunas devem vir zeradas. A terceira mostra as duplicatas
-- de teste, que ficam de fora de propósito.
select
  (select count(*) from (
     select devedor_id from conversas where simulacao is not true
     group by devedor_id having count(*) > 1
   ) d) as devedores_reais_ainda_duplicados,
  (select count(*) from conversas c
    where c.telefone_id is null
      and c.simulacao is not true
      and exists (select 1 from telefones_devedor t where t.devedor_id = c.devedor_id)
  ) as conversas_reais_sem_telefone,
  (select count(*) from (
     select devedor_id from conversas where simulacao is true
     group by devedor_id having count(*) > 1
   ) t) as duplicatas_de_teste_preservadas;
