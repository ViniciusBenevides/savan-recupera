-- SAVAN Recupera — 029: roteiro do bot por carteira (§33 · pendência D2)
--
-- O comportamento do bot era só um prompt em prosa (persona + contexto + guardrails): dava para pedir
-- educadamente que ele confirmasse a identidade antes de revelar CPF/valor, mas não havia MÁQUINA DE
-- ESTADOS — se o modelo pulasse a etapa, nada barrava. Num produto de cobrança com as restrições da §1
-- (LGPD, número reciclado depois de 15 anos), isso é o requisito mais sensível que existe.
--
-- O roteiro traz do concorrente a ideia do grafo declarativo (mensagem → casos por intenção → espera),
-- em JSON e sem editor visual: cada conversa guarda a ETAPA em que está, e o bot recebe essa etapa
-- como estado. As 6 tools continuam iguais — o roteiro guia, não substitui.
--
-- Formato de `carteiras.roteiro`:
--   { "ativo": true,
--     "etapas": [
--       { "id": "identificar", "objetivo": "Confirmar que fala com a pessoa certa",
--         "instrucao": "Pergunte se fala com {{primeiro_nome}}. NÃO revele CPF nem valor antes disso.",
--         "casos": [ { "quando": "confirmou ser a pessoa", "vai_para": "proposta" },
--                    { "quando": "disse que não é a pessoa", "vai_para": "encerrar_errado" } ] },
--       ...
--     ] }

alter table carteiras  add column if not exists roteiro jsonb;
alter table conversas  add column if not exists etapa_roteiro text;

create index if not exists idx_conversas_etapa on conversas (etapa_roteiro) where etapa_roteiro is not null;

comment on column carteiras.roteiro is
  'Roteiro declarativo do bot: {ativo, etapas[{id, objetivo, instrucao, casos[{quando, vai_para}]}]}. NULL = bot livre pelo prompt (§33).';
comment on column conversas.etapa_roteiro is
  'Etapa corrente do roteiro nesta conversa. NULL = ainda na primeira etapa.';

-- Roteiro-modelo: fica disponível para o painel oferecer "começar a partir do padrão".
-- Vai em `configuracoes` (global) para não precisar de tabela nova nem de deploy para ajustar.
insert into configuracoes (chave, valor, descricao)
select 'roteiro_modelo',
       '{
         "ativo": true,
         "etapas": [
           {
             "id": "identificar",
             "objetivo": "Confirmar que está falando com a pessoa certa",
             "instrucao": "Cumprimente pelo primeiro nome e pergunte se fala com {{primeiro_nome}}. NUNCA revele CPF, valor da dívida ou nome do credor antes da confirmação.",
             "casos": [
               { "quando": "confirmou que é a pessoa", "vai_para": "proposta" },
               { "quando": "disse que não é a pessoa ou é número errado", "vai_para": "encerrar_pessoa_errada" },
               { "quando": "pediu para não ser mais contatado", "vai_para": "encerrar_nao_perturbe" }
             ]
           },
           {
             "id": "proposta",
             "objetivo": "Apresentar a quitação com desconto",
             "instrucao": "Chame consultar_divida e apresente valor, desconto e validade. Enquadre como quitação voluntária e encerramento definitivo com termo de quitação.",
             "casos": [
               { "quando": "aceitou ou quer pagar", "vai_para": "pagamento" },
               { "quando": "achou caro ou pediu desconto", "vai_para": "objecao_valor" },
               { "quando": "contestou a dívida, não reconhece ou citou advogado", "vai_para": "escalar" },
               { "quando": "perguntou se prescreveu ou se precisa pagar", "vai_para": "duvida_prescricao" }
             ]
           },
           {
             "id": "objecao_valor",
             "objetivo": "Tratar a objeção de preço uma única vez",
             "instrucao": "Só depois da recusa explícita, use desconto_extra uma vez. Nunca ofereça abaixo do mínimo e nunca pressione.",
             "casos": [
               { "quando": "aceitou", "vai_para": "pagamento" },
               { "quando": "recusou de novo", "vai_para": "encerrar_sem_acordo" }
             ]
           },
           {
             "id": "duvida_prescricao",
             "objetivo": "Responder com honestidade",
             "instrucao": "Responda honestamente que a dívida é antiga, pode estar prescrita e o pagamento é voluntário. Não pressione. Depois retome a proposta sem insistir.",
             "casos": [
               { "quando": "seguiu interessado", "vai_para": "proposta" },
               { "quando": "desistiu", "vai_para": "encerrar_sem_acordo" }
             ]
           },
           {
             "id": "pagamento",
             "objetivo": "Gerar o Pix e orientar",
             "instrucao": "Chame gerar_pix, envie o copia-e-cola e avise que o termo de quitação chega após a confirmação do pagamento.",
             "casos": [ { "quando": "confirmou que vai pagar ou pagou", "vai_para": "encerrar_acordo" } ]
           },
           { "id": "escalar", "objetivo": "Passar para um humano", "instrucao": "Chame escalar_humano com o motivo e se despeça com cordialidade.", "casos": [] },
           { "id": "encerrar_pessoa_errada", "objetivo": "Encerrar", "instrucao": "Peça desculpas, chame pessoa_errada e encerre.", "casos": [] },
           { "id": "encerrar_nao_perturbe", "objetivo": "Encerrar", "instrucao": "Confirme educadamente, chame nao_perturbe e encerre.", "casos": [] },
           { "id": "encerrar_sem_acordo", "objetivo": "Encerrar em aberto", "instrucao": "Agradeça, deixe a porta aberta e encerre sem insistir.", "casos": [] },
           { "id": "encerrar_acordo", "objetivo": "Encerrar com acordo", "instrucao": "Agradeça e reforce que o termo de quitação chega após a confirmação.", "casos": [] }
         ]
       }'::jsonb,
       'Roteiro-modelo do bot, oferecido como ponto de partida ao configurar uma carteira (§33)'
where not exists (select 1 from configuracoes where chave = 'roteiro_modelo' and cobrador_id is null);
