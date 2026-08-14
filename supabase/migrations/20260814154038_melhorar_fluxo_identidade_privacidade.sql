-- Torna explícitas, no fluxo versionado e na base aprovada, as respostas para
-- os casos reais de terceiro, recusa de identidade, documento e origem do
-- telefone. As barreiras determinísticas correspondentes vivem em bot-turno.

with roteiros_atualizados as (
  select
    c.id,
    jsonb_set(
      c.roteiro,
      '{etapas}',
      coalesce((
        select jsonb_agg(
          case e->>'id'
            when 'identificar' then jsonb_set(
              e,
              '{instrucao}',
              to_jsonb(
                'Peça confirmação explícita com sim ou não. Se disser que é familiar, vai repassar o contato, não é a pessoa ou é número errado, encerre como pessoa_errada. Se pedir para não receber mensagens, encerre como nao_perturbe sem exigir identidade. Se questionar o assunto, explique apenas que é um atendimento da MC Cred relacionado à SAVAN, não peça documento/CPF e repita a confirmação uma única vez. Nunca ultrapasse duas tentativas nem revele CPF, valor ou dívida antes da confirmação.'::text
              )
            )
            when 'proposta' then jsonb_set(
              e,
              '{instrucao}',
              to_jsonb(
                'Chame consultar_divida e apresente origem, valor, desconto e validade. Uma recusa simples encerra sem nova oferta e sem perguntar sobre opt-out. Se pedir documento/comprovante ou perguntar a origem do telefone, pause a negociação e escale para humano; não ofereça Pix de novo e não invente a fonte do dado.'::text
              )
            )
            when 'esclarecer_origem' then jsonb_set(
              e,
              '{instrucao}',
              to_jsonb(
                'Chame consultar_origem para dúvidas sobre a dívida e informe apenas dados disponíveis, após identidade confirmada. Pedido de comprovante, contrato ou documento deve ir para humano antes de nova oferta. Pergunta sobre como o telefone foi obtido também deve ir para humano; nunca presuma que o número veio da SAVAN ou da cessão da carteira. Não aceite pagamento na loja SAVAN.'::text
              )
            )
            else e
          end
          order by ord
        )
        from jsonb_array_elements(c.roteiro->'etapas') with ordinality as etapa(e, ord)
      ), '[]'::jsonb),
      true
    ) as roteiro
  from public.carteiras c
  where c.roteiro is not null
    and jsonb_typeof(c.roteiro->'etapas') = 'array'
)
update public.carteiras c
set roteiro = r.roteiro
from roteiros_atualizados r
where c.id = r.id;

-- O modelo exibido para novas carteiras recebe as mesmas regras.
with modelo as (
  select
    cfg.chave,
    cfg.cobrador_id,
    jsonb_set(
      cfg.valor,
      '{etapas}',
      coalesce((
        select jsonb_agg(
          case e->>'id'
            when 'identificar' then jsonb_set(e, '{instrucao}', to_jsonb(
              'Peça confirmação explícita com sim ou não. Terceiro, familiar, número errado ou quem vai repassar o contato é pessoa_errada. Pedido para parar mensagens é nao_perturbe e não exige identidade. Explique o contexto seguro apenas uma vez e nunca ultrapasse duas tentativas.'::text
            ))
            when 'proposta' then jsonb_set(e, '{instrucao}', to_jsonb(
              'Apresente a proposta após consultar_divida. Recusa simples encerra sem insistência. Pedido de documento ou origem do telefone pausa a negociação e vai para humano, sem nova oferta de Pix.'::text
            ))
            when 'esclarecer_origem' then jsonb_set(e, '{instrucao}', to_jsonb(
              'Explique somente dados verificáveis da dívida. Documento/comprovante e origem do telefone vão para humano; nunca invente a fonte do contato nem pressione por pagamento.'::text
            ))
            else e
          end
          order by ord
        )
        from jsonb_array_elements(cfg.valor->'etapas') with ordinality as etapa(e, ord)
      ), '[]'::jsonb),
      true
    ) as valor
  from public.configuracoes cfg
  where cfg.chave = 'roteiro_modelo'
    and jsonb_typeof(cfg.valor->'etapas') = 'array'
)
update public.configuracoes cfg
set valor = m.valor, atualizado_em = now()
from modelo m
where cfg.chave = m.chave
  and cfg.cobrador_id is not distinct from m.cobrador_id;

-- Cada carteira passa a apontar para um snapshot novo; conversas em andamento
-- continuam presas à versão em que começaram, preservando a auditoria.
with novas_versoes as (
  insert into public.fluxo_versoes (
    carteira_id, versao, nome, roteiro,
    meta_abordagem_template, meta_abordagem_template_candidato,
    origem_versao_id
  )
  select
    c.id,
    coalesce((select max(fv.versao) from public.fluxo_versoes fv where fv.carteira_id = c.id), 0) + 1,
    'Privacidade, terceiros e não insistência',
    c.roteiro,
    coalesce(
      (select valor from public.configuracoes where chave = 'meta_abordagem_template' and cobrador_id = c.cobrador_id limit 1),
      (select valor from public.configuracoes where chave = 'meta_abordagem_template' and cobrador_id is null limit 1)
    ),
    coalesce(
      (select valor from public.configuracoes where chave = 'meta_abordagem_template_candidato' and cobrador_id = c.cobrador_id limit 1),
      (select valor from public.configuracoes where chave = 'meta_abordagem_template_candidato' and cobrador_id is null limit 1)
    ),
    c.fluxo_versao_ativa_id
  from public.carteiras c
  where c.roteiro is not null
  returning id, carteira_id
)
update public.carteiras c
set fluxo_versao_ativa_id = nv.id
from novas_versoes nv
where c.id = nv.carteira_id;

update public.bot_conhecimento
set resposta = 'Explique somente os dados verificáveis depois da identidade confirmada. Se a pessoa pedir comprovante, contrato ou documento da compra, pause a negociação e encaminhe para humano localizar a documentação. Não ofereça Pix novamente e deixe claro que ela pode conferir antes de decidir sobre pagamento. Se apenas não lembrar ou suspeitar de golpe, informe os dados disponíveis sem inventar.'
where pergunta = 'Não lembro dessa compra / isso parece golpe';

insert into public.bot_conhecimento (
  carteira_id, cobrador_id, pergunta, resposta, aprovado, ativo, aprovado_em
)
select
  c.id,
  c.cobrador_id,
  'Como conseguiram meu número?',
  'O atendimento automático não conhece a fonte específica do telefone e nunca deve afirmar que ele veio da SAVAN ou da cessão da carteira sem evidência. Pause a negociação, não peça documentos nem outros dados e encaminhe para a equipe verificar a origem do contato.',
  true,
  true,
  now()
from public.carteiras c
where not exists (
  select 1 from public.bot_conhecimento bc
  where bc.carteira_id = c.id and bc.pergunta = 'Como conseguiram meu número?'
);

insert into public.bot_conhecimento (
  carteira_id, cobrador_id, pergunta, resposta, aprovado, ativo, aprovado_em
)
select
  c.id,
  c.cobrador_id,
  'Quero o comprovante ou documento da compra',
  'Confirme que a pessoa pode conferir a documentação antes de decidir sobre pagamento. Pause a negociação e encaminhe para humano localizar comprovante, contrato ou documento de origem. Não repita a proposta e não ofereça Pix enquanto o pedido documental estiver pendente.',
  true,
  true,
  now()
from public.carteiras c
where not exists (
  select 1 from public.bot_conhecimento bc
  where bc.carteira_id = c.id and bc.pergunta = 'Quero o comprovante ou documento da compra'
);
