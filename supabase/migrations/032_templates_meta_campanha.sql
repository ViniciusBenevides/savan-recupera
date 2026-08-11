-- 032 — Liga os templates aprovados da Meta ao disparo da campanha (§32).
-- Fora da janela de 24h a Cloud API só aceita MODELO APROVADO. Quem abre a conversa (abordagem)
-- e quem reengaja quem não respondeu (follow-ups) caem exatamente nesse caso — então cada um
-- aponta para um template da WABA. Depois que a pessoa responde, a janela abre e o bot volta a
-- falar livre (grátis), usando os textos do fluxo da carteira.
--
-- `variaveis` mapeia as posições do template: variaveis[0] -> {{1}}, variaveis[1] -> {{2}}, ...
-- Nomes disponíveis: primeiro_nome, nome, credor, nome_bot.
-- Idempotente.

insert into configuracoes (chave, valor, descricao) values (
  'meta_abordagem_template',
  '{"name":"savan_abordagem_identidade","language":"pt_BR","variaveis":["primeiro_nome"]}'::jsonb,
  'Template aprovado da Meta usado na 1ª mensagem (abordagem fria). Sem ele — ou com ele não aprovado — a campanha não dispara.'
)
on conflict (chave) where cobrador_id is null do nothing;

insert into configuracoes (chave, valor, descricao) values (
  'meta_followup_templates',
  '{"lista":[
     {"name":"savan_followup_1_v2","language":"pt_BR","variaveis":["primeiro_nome"]},
     {"name":"savan_followup_2","language":"pt_BR","variaveis":["primeiro_nome"]},
     {"name":"savan_followup_3_v2","language":"pt_BR","variaveis":["primeiro_nome"]}
   ]}'::jsonb,
  'Templates aprovados da Meta para os reenvios (1º, 2º, 3º). Quem não respondeu está fora da janela de 24h, então o reenvio também precisa ser modelo aprovado.'
)
on conflict (chave) where cobrador_id is null do nothing;
