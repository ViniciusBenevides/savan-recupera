-- SAVAN Recupera — 023: intervalo de envio ALEATÓRIO + variação de TAMANHO das mensagens (anti-ban)
-- Pedido do dono: dificultar o banimento do chip. Duas frentes:
--   1) o tempo entre mensagens deixa de ser fixo e passa a ser SORTEADO em [min, max] (recomendado 30–90s);
--   2) as mensagens de abordagem ganham spintax OPCIONAL ({|texto}) p/ variar o tamanho a cada envio.
-- O sorteio do tempo é feito no Edge `campanha-lote` (campo delay_proximo) e a espera vira dinâmica no n8n W01.

-- ============================================================
-- 1) Intervalo: novo TETO + atualizar o piso global (12 era o fixo antigo)
-- ============================================================
-- novo teto global (só insere se ainda não existir a linha global)
insert into configuracoes (chave, valor, descricao)
select 'intervalo_max_segundos', '90'::jsonb,
       'Intervalo MÁXIMO entre mensagens do mesmo chip; o tempo real é sorteado entre o mínimo e o máximo (anti-ban)'
where not exists (
  select 1 from configuracoes where chave = 'intervalo_max_segundos' and cobrador_id is null
);

-- piso global: sobe de 12 (fixo antigo) para 30 — só se ainda estiver no valor antigo (não clobra ajuste manual)
update configuracoes
   set valor = '30'::jsonb, atualizado_em = now()
 where chave = 'intervalo_min_segundos' and cobrador_id is null and valor = '12'::jsonb;

comment on column configuracoes.valor is
  'Valor JSON da chave. intervalo_min_segundos/intervalo_max_segundos definem o sorteio do tempo entre envios.';

-- ============================================================
-- 2) Templates de abordagem com spintax de TAMANHO variável
--    (só os modelos GLOBAIS — cobrador_id IS NULL; os personalizados de cada cobrador ficam intactos)
--    Restrição do resolvedor: alternativas {a|b} NÃO podem conter { } — por isso {{primeiro_nome}}/
--    {{nome_bot}} ficam FORA dos blocos. O bloco {|texto} sorteia incluir/omitir → varia o comprimento.
-- ============================================================
update templates_mensagem set conteudo =
  '{Oi|Olá|Oi, tudo bem?|Olá, tudo certo?} Falo com {{primeiro_nome}}? Aqui é a {{nome_bot}}{ da nossa loja de calçados|, da central de atendimento da nossa loja de calçados| da loja de calçados}.{| 😊} {Tenho uma boa notícia em seu nome|Apareceu uma condição especial em seu nome aqui no sistema|Tenho uma novidade boa pra você}{ e queria te contar rapidinho|}. {Pode falar agora?|Tem um minutinho?|Posso te explicar?}'
where nome = 'Abordagem 1 — boa notícia' and tipo = 'abordagem_inicial' and cobrador_id is null;

update templates_mensagem set conteudo =
  '{Olá|Oi}! {Sou a|Aqui é a} {{nome_bot}}{ e falo em nome da nossa loja de calçados| da nossa loja de calçados|, da loja de calçados}.{| 😊} {Estou procurando|Queria falar com} {{primeiro_nome}}{ para uma oportunidade de regularização com desconto especial| sobre uma condição especial de regularização| sobre um desconto especial pra você}. {É você?|Falo com a pessoa certa?|Pode ser agora?}'
where nome = 'Abordagem 2 — oportunidade' and tipo = 'abordagem_inicial' and cobrador_id is null;

update templates_mensagem set conteudo =
  '{Oi|Olá}, {{primeiro_nome}}! Aqui é a {{nome_bot}}{, da nossa loja de calçados| da loja de calçados}. {Temos uma proposta exclusiva de encerramento definitivo de uma pendência antiga, com desconto de verdade|Apareceu uma condição especial pra encerrar de vez uma pendência antiga, com desconto real|Tenho uma proposta pra encerrar uma pendência antiga, com um bom desconto}.{| 😊} {Quer saber os detalhes?|Posso te explicar?|Quer que eu te conte?}'
where nome = 'Abordagem 3 — direta e leve' and tipo = 'abordagem_inicial' and cobrador_id is null;
