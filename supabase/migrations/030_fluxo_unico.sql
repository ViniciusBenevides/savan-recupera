-- SAVAN Recupera — 030: um lugar só para configurar o robô = o FLUXO da carteira (§35)
--
-- Antes o robô se configurava em dois lugares que ninguém conseguia distinguir:
--   `templates_mensagem` (global/por cobrador) mandava a 1ª mensagem e os follow-ups;
--   `carteiras.roteiro` guiava a conversa DEPOIS que a pessoa respondia.
-- Era a mesma pergunta ("o que o robô fala?") partida por um detalhe de implementação — quem manda
-- é a campanha (texto fixo) ou o bot-turno (IA). O operador tinha de saber disso para achar a tela.
--
-- Agora o disparo e os follow-ups viram BLOCOS do mesmo fluxo, com o texto fixo dentro deles: nada
-- de IA escrevendo o contato frio (o texto previsível é o que segura o anti-ban da §28/§31 e o
-- enquadramento jurídico da §1) — só mudou de lugar, e o operador vê a linha do tempo inteira num
-- desenho só.
--
-- Formato de `carteiras.roteiro` (o campo `tipo` é novo; ausente = "conversa", nada a migrar):
--   { "ativo": true,
--     "etapas": [
--       { "id": "abordagem", "tipo": "disparo",
--         "textos": ["{Oi|Olá}, {{primeiro_nome}}! …", "variação 2…"],
--         "casos": [ { "quando": "a pessoa responder", "vai_para": "identificar" } ] },
--       { "id": "followup_1", "tipo": "followup", "espera_horas": 24, "textos": ["…"] },
--       { "id": "identificar", "tipo": "conversa", "objetivo": "…", "instrucao": "…",
--         "casos": [ { "quando": "confirmou", "vai_para": "proposta" } ] },
--       { "id": "termo_quitacao", "tipo": "pos_pagamento", "textos": ["📄 TERMO…"] }
--     ] }
--
-- Regras que o backend aplica sobre esse formato:
--   • disparo      → campanha-lote. `textos` é sorteado (era o peso entre vários templates).
--   • followup     → campanha-followup, na ORDEM em que aparecem; `espera_horas` é o tempo desde a
--                    última mensagem. Sem bloco de follow-up, a carteira simplesmente não reengaja.
--   • conversa     → bot-turno, como antes. A entrada é o `vai_para` do "respondeu" do disparo.
--   • pos_pagamento→ webhook-asaas, na ordem, quando o Pix é confirmado.
--
-- `templates_mensagem` continua no banco e continua sendo o FALLBACK de quem ainda não tem fluxo —
-- só perdeu a tela. Nenhuma carteira para de enviar por causa desta migration.

comment on column carteiras.roteiro is
  'Fluxo do robô: {ativo, etapas[{id, tipo: disparo|followup|conversa|pos_pagamento, textos[], espera_horas, objetivo, instrucao, casos[{quando, vai_para}], pos}]}. NULL = sem fluxo (cai nos templates_mensagem e no bot livre pelo prompt). §35';

-- ============================================================
-- Blocos de mensagem a partir dos templates que a conta já usa
-- ============================================================
-- O texto que o operador escreveu continua sendo o texto que sai: a migration não inventa conteúdo,
-- ela só muda o texto de lugar. `cob` NULL = usa os modelos globais.
create or replace function mig030_textos_do_tipo(p_tipo text, p_cob uuid)
returns jsonb language sql stable as $$
  select coalesce(
    (select jsonb_agg(conteudo order by peso desc, id)
       from templates_mensagem
      where tipo = p_tipo and ativo and cobrador_id = p_cob),
    (select jsonb_agg(conteudo order by peso desc, id)
       from templates_mensagem
      where tipo = p_tipo and ativo and cobrador_id is null),
    '[]'::jsonb);
$$;

-- Monta os blocos de disparo + follow-ups + pós-pagamento de uma conta, apontando o "respondeu"
-- para a etapa de conversa que abre o atendimento.
create or replace function mig030_blocos_mensagem(p_cob uuid, p_entrada text)
returns jsonb language plpgsql stable as $$
declare
  horas jsonb;
  saida jsonb := '[]'::jsonb;
  txts jsonb;
  n int;
begin
  select coalesce(valor -> 'intervalos_horas', '[24,72,168]'::jsonb) into horas
    from configuracoes where chave = 'followup' and cobrador_id is null;
  horas := coalesce(horas, '[24,72,168]'::jsonb);

  txts := mig030_textos_do_tipo('abordagem_inicial', p_cob);
  saida := jsonb_build_array(jsonb_build_object(
    'id', 'abordagem', 'tipo', 'disparo',
    'objetivo', 'Primeira mensagem',
    'textos', case when jsonb_array_length(txts) > 0 then txts
                   else '["{Oi|Olá}, {{primeiro_nome}}! Aqui é a {{nome_bot}}. Posso falar rapidinho sobre uma pendência antiga?"]'::jsonb end,
    'casos', case when p_entrada is null then '[]'::jsonb
                  else jsonb_build_array(jsonb_build_object('quando', 'a pessoa responder', 'vai_para', p_entrada)) end,
    'pos', jsonb_build_object('x', -680, 'y', 0)));

  for n in 1..3 loop
    txts := mig030_textos_do_tipo('followup_' || n, p_cob);
    continue when jsonb_array_length(txts) = 0;
    saida := saida || jsonb_build_array(jsonb_build_object(
      'id', 'followup_' || n, 'tipo', 'followup',
      'objetivo', 'Reenvio ' || n || ' (sem resposta)',
      'espera_horas', coalesce((horas ->> (n - 1))::int, 24 * n),
      'textos', txts,
      'pos', jsonb_build_object('x', -680, 'y', 190 * n)));
  end loop;

  txts := mig030_textos_do_tipo('confirmacao_pagamento', p_cob);
  if jsonb_array_length(txts) > 0 then
    saida := saida || jsonb_build_array(jsonb_build_object(
      'id', 'confirmacao_pagamento', 'tipo', 'pos_pagamento',
      'objetivo', 'Confirmação do pagamento', 'textos', txts));
  end if;

  txts := mig030_textos_do_tipo('quitacao', p_cob);
  if jsonb_array_length(txts) > 0 then
    saida := saida || jsonb_build_array(jsonb_build_object(
      'id', 'termo_quitacao', 'tipo', 'pos_pagamento',
      'objetivo', 'Termo de quitação', 'textos', txts));
  end if;

  return saida;
end $$;

-- ============================================================
-- 1) Roteiro-modelo (ponto de partida de toda carteira nova)
-- ============================================================
update configuracoes
   set valor = jsonb_set(valor, '{etapas}',
                 mig030_blocos_mensagem(null, valor -> 'etapas' -> 0 ->> 'id') || (valor -> 'etapas')),
       descricao = 'Fluxo-modelo do robô (disparo → follow-ups → conversa → pós-pagamento), oferecido ao configurar uma carteira (§35)'
 where chave = 'roteiro_modelo' and cobrador_id is null
   and jsonb_typeof(valor -> 'etapas') = 'array'
   and not (valor -> 'etapas' @> '[{"tipo":"disparo"}]'::jsonb);

-- ============================================================
-- 2) Carteiras que já tinham fluxo ganham os blocos de mensagem
-- ============================================================
-- Quem já desenhou um fluxo optou por configurar o robô ali — então é ali que os textos precisam
-- aparecer. Quem NÃO tem fluxo fica como está: continua no fallback de templates até abrir a tela e
-- começar pelo modelo (que agora já vem com os blocos).
do $$
declare
  c record;
begin
  for c in
    select id, cobrador_id, roteiro
      from carteiras
     where jsonb_typeof(roteiro -> 'etapas') = 'array'
       and roteiro -> 'etapas' <> '[]'::jsonb
       and not (roteiro -> 'etapas' @> '[{"tipo":"disparo"}]'::jsonb)
  loop
    update carteiras
       set roteiro = jsonb_set(c.roteiro, '{etapas}',
             mig030_blocos_mensagem(c.cobrador_id, c.roteiro -> 'etapas' -> 0 ->> 'id') || (c.roteiro -> 'etapas'))
     where id = c.id;
  end loop;
end $$;

drop function if exists mig030_blocos_mensagem(uuid, text);
drop function if exists mig030_textos_do_tipo(text, uuid);
