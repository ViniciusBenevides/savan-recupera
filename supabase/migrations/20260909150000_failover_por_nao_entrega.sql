-- Failover por NÃO-ENTREGA (09/09/2026)
--
-- O problema: o único failover de telefone que existia disparava em `sem_whatsapp` — o provedor
-- dizendo, com todas as letras, que o número não existe. No canal Baileys esse sinal NUNCA vem: a
-- sondagem `on_whatsapp` foi removida de propósito (§8: sondar números desconhecidos é padrão de
-- robô) e o envio sempre volta "aceito". Resultado: quem tinha o primeiro número morto ficava
-- parado para sempre, com a abordagem marcada como "enviado" e nada tendo chegado. Foi o caso do
-- devedor 600 em 09/09/2026 — duas mensagens aceitas pelo servidor, zero conversas no aparelho.
--
-- O sinal que substitui: o RECIBO DE ENTREGA. Medido em produção, toda confirmação chegou entre 2 e
-- 3 segundos do envio (12 de 12). Um recibo que não avançou de `1` em 24 horas é, na prática, uma
-- mensagem que não chegou.
--
-- Por que 24 horas e não 1 minuto: entrega exige o aparelho do outro lado LIGADO. Celular
-- descarregado também para em `1` e entrega quando a pessoa volta. Trocar de número em minutos
-- queimaria um número bom por impaciência.
--
-- Por que no máximo 3 números e não todos: as dívidas são de ~2015 e os telefones extras vieram de
-- enriquecimento em massa — média de 6,7 por pessoa, máximo 21. A maioria hoje é de ESTRANHO, não
-- do devedor. Esgotar todos multiplicaria por 6,7 a exposição a quem não reconhece a MC Cred, que é
-- exatamente o mecanismo do ban permanente da conta oficial (§38, `ban_reason =
-- bm_reactive_scam_model_enforcement_heuristic`: o modelo reagiu ao PADRÃO da abordagem). O teto é
-- uma decisão de risco, não um detalhe de implementação.

-- ── 1. Para qual número cada mensagem foi ────────────────────────────────────────────────────
--
-- Sem isto não dá para saber quantos números já foram tentados, nem para dizer ao operador na tela
-- "já tentei o X e o Y". `conversas.telefone_id` guarda só o número ATUAL, e ele é sobrescrito a
-- cada troca — a trilha se perdia.
alter table mensagens
  add column if not exists telefone_id bigint references telefones_devedor(id) on delete set null;

comment on column mensagens.telefone_id is
  'Telefone do devedor para o qual ESTA mensagem saiu. É a trilha de tentativas usada pelo failover '
  'por não-entrega (fn_failover_entrega) e pelo histórico mostrado na aba Conversas. Nulo em '
  'mensagens de entrada e no histórico anterior a 09/09/2026 que não pôde ser inferido.';

-- Retroativo: a conversa aponta para o telefone que estava em uso. Para o histórico existente é a
-- melhor informação disponível — e é conservadora, porque no pior caso conta uma tentativa a mais
-- do que houve, nunca a menos.
update mensagens m
   set telefone_id = c.telefone_id
  from conversas c
 where c.id = m.conversa_id
   and m.telefone_id is null
   and c.telefone_id is not null;

-- ── 2. O trigger passa a carimbar chip E telefone ────────────────────────────────────────────
-- Mesmo motivo do carimbo de chip: quem escreve em `mensagens` são cinco caminhos diferentes
-- (campanha-registrar, chatwoot-sync, bot-turno, followup, painel) e exigir que todos lembrem de
-- preencher a coluna é garantir que um deles esqueça.
create or replace function fn_mensagens_carimbar_origem() returns trigger
language plpgsql
as $$
begin
  if new.chip_id is null then
    select c.chip_id into new.chip_id from conversas c where c.id = new.conversa_id;
  end if;
  if new.telefone_id is null then
    select c.telefone_id into new.telefone_id from conversas c where c.id = new.conversa_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mensagens_chip on mensagens;
drop trigger if exists trg_mensagens_origem on mensagens;
create trigger trg_mensagens_origem
  before insert on mensagens
  for each row execute function fn_mensagens_carimbar_origem();

drop function if exists fn_mensagens_carimbar_chip();

-- A varredura filtra por conversa + direção e ordena por data; sem o índice ela vira seq scan em
-- `mensagens` a cada 5 minutos.
create index if not exists idx_mensagens_saida_por_conversa
  on mensagens (conversa_id, criado_em desc)
  where direcao = 'saida';

-- ── 3. A varredura ───────────────────────────────────────────────────────────────────────────
--
-- Devolve uma linha por item criado. Não envia nada: só devolve a pessoa para a fila com o próximo
-- número. Quem decide se ela pode mesmo ser abordada agora continua sendo o `fn_selecionar_lote`
-- (carteira ativa, ritmo, aquecimento, janela) — este é o único lugar onde essas regras moram.
--
-- Os cinco portões:
--   • `estado = 'aguardando_resposta'` — quem respondeu, pagou, pediu para parar ou foi escalado
--     está fora. Um novo envio para essas pessoas seria contato indesejado, não failover.
--   • `entradas = 0` — reforço do anterior: se a pessoa escreveu alguma vez, o número funciona.
--   • `melhor recibo < 2` — se QUALQUER mensagem já foi entregue, o número está certo e o silêncio
--     é da pessoa, não do transporte. Isso é assunto do follow-up (§35), não do failover.
--   • sem item pendente na fila — não empilha duas tentativas para a mesma pessoa.
--   • sem `bloqueios_contato` — o "não" é permanente e vale para todos os chips (ADR-0003, R4).
create or replace function fn_failover_entrega(
  p_horas int default 24,
  p_max_numeros int default 3
)
returns table (devedor_id bigint, telefone_id bigint, tentativa int)
language sql
as $$
  with base as (
    select
      c.devedor_id,
      c.carteira_id,
      max(m.criado_em) filter (where m.direcao = 'saida' and m.origem = 'bot') as ultima_saida,
      count(*) filter (where m.direcao = 'entrada')                            as entradas,
      coalesce(max(m.status_entrega) filter (where m.direcao = 'saida'), 0)    as melhor_recibo,
      array_remove(
        array_agg(distinct m.telefone_id) filter (where m.direcao = 'saida' and m.origem = 'bot'),
        null
      ) as tentados
    from conversas c
    join mensagens m on m.conversa_id = c.id
    where c.simulacao is not true
      and c.estado = 'aguardando_resposta'
    group by c.devedor_id, c.carteira_id
  ),
  elegiveis as (
    select distinct on (b.devedor_id) b.*
      from base b
     where b.ultima_saida is not null
       and b.ultima_saida < now() - make_interval(hours => p_horas)
       and b.entradas = 0
       and b.melhor_recibo < 2
       and cardinality(b.tentados) between 1 and greatest(p_max_numeros - 1, 0)
       and not exists (
         select 1 from fila_envios f
          where f.devedor_id = b.devedor_id
            and f.status in ('aguardando', 'processando')
       )
       and not exists (
         select 1 from bloqueios_contato bc where bc.devedor_id = b.devedor_id
       )
     order by b.devedor_id, b.ultima_saida desc
  ),
  -- O próximo celular ainda não tentado. Mesmos filtros do `fn_proximo_telefone` (só móvel, nada
  -- já reprovado), mas excluindo a trilha inteira em vez de um id só.
  escolhidos as (
    select e.devedor_id, e.carteira_id, t.id as telefone_id,
           cardinality(e.tentados) + 1 as tentativa
      from elegiveis e
      cross join lateral (
        select td.id
          from telefones_devedor td
         where td.devedor_id = e.devedor_id
           and td.tipo = 'movel'
           and (td.whatsapp_valido is null or td.whatsapp_valido = true)
           and not (td.id = any (e.tentados))
         order by td.ordem
         limit 1
      ) t
  ),
  inseridos as (
    insert into fila_envios (devedor_id, telefone_id, carteira_id, status, prioridade, simulacao)
    select es.devedor_id, es.telefone_id, es.carteira_id, 'aguardando', 0, false
      from escolhidos es
    returning fila_envios.devedor_id, fila_envios.telefone_id
  )
  select i.devedor_id, i.telefone_id, es.tentativa
    from inseridos i
    join escolhidos es on es.devedor_id = i.devedor_id;
$$;

comment on function fn_failover_entrega(int, int) is
  'Devolve à fila, com o PRÓXIMO celular, quem foi abordado há mais de p_horas e nunca teve entrega '
  'confirmada em nenhum número — até p_max_numeros telefones por pessoa. Não envia nada.';

-- Operação privilegiada: cria item de fila, que vira mensagem para uma pessoa real. Só o
-- service_role (metricas-sync) chama.
revoke execute on function fn_failover_entrega(int, int) from public, anon, authenticated;
