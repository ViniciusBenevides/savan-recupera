-- SAVAN Recupera — 003: RLS, realtime e seeds

-- ===== RLS =====
alter table devedores enable row level security;
alter table telefones_devedor enable row level security;
alter table chips enable row level security;
alter table chips_credenciais enable row level security;      -- SEM policy: só service_role
alter table chip_metricas_diarias enable row level security;
alter table templates_mensagem enable row level security;
alter table fila_envios enable row level security;
alter table conversas enable row level security;
alter table mensagens enable row level security;
alter table negociacoes enable row level security;
alter table pagamentos enable row level security;
alter table eventos_campanha enable row level security;
alter table metricas_diarias enable row level security;
alter table configuracoes enable row level security;
alter table usuarios_app enable row level security;
alter table bot_fila_mensagens enable row level security;     -- SEM policy: só service_role
alter table bot_locks enable row level security;              -- SEM policy: só service_role

-- Leitura para usuários logados
create policy sel_devedores on devedores for select to authenticated using (true);
create policy sel_telefones on telefones_devedor for select to authenticated using (true);
create policy sel_chips on chips for select to authenticated using (true);
create policy sel_chip_metricas on chip_metricas_diarias for select to authenticated using (true);
create policy sel_templates on templates_mensagem for select to authenticated using (true);
create policy sel_fila on fila_envios for select to authenticated using (true);
create policy sel_conversas on conversas for select to authenticated using (true);
create policy sel_mensagens on mensagens for select to authenticated using (true);
create policy sel_negociacoes on negociacoes for select to authenticated using (true);
create policy sel_pagamentos on pagamentos for select to authenticated using (true);
create policy sel_eventos on eventos_campanha for select to authenticated using (true);
create policy sel_metricas on metricas_diarias for select to authenticated using (true);
create policy sel_configuracoes on configuracoes for select to authenticated using (true);
create policy sel_usuarios on usuarios_app for select to authenticated using (true);

-- Escrita: admin + operador
create policy upd_configuracoes on configuracoes for update to authenticated
  using (fn_role() in ('admin','operador')) with check (fn_role() in ('admin','operador'));
create policy ins_configuracoes on configuracoes for insert to authenticated
  with check (fn_role() = 'admin');

create policy ins_templates on templates_mensagem for insert to authenticated
  with check (fn_role() in ('admin','operador'));
create policy upd_templates on templates_mensagem for update to authenticated
  using (fn_role() in ('admin','operador')) with check (fn_role() in ('admin','operador'));
create policy del_templates on templates_mensagem for delete to authenticated
  using (fn_role() = 'admin');

create policy upd_chips on chips for update to authenticated
  using (fn_role() in ('admin','operador')) with check (fn_role() in ('admin','operador'));

create policy upd_devedores on devedores for update to authenticated
  using (fn_role() in ('admin','operador')) with check (fn_role() in ('admin','operador'));

create policy upd_telefones on telefones_devedor for update to authenticated
  using (fn_role() in ('admin','operador')) with check (fn_role() in ('admin','operador'));

create policy upd_fila on fila_envios for update to authenticated
  using (fn_role() in ('admin','operador')) with check (fn_role() in ('admin','operador'));

create policy upd_usuarios on usuarios_app for update to authenticated
  using (fn_role() = 'admin') with check (fn_role() = 'admin');
create policy del_usuarios on usuarios_app for delete to authenticated
  using (fn_role() = 'admin');

-- ===== REALTIME =====
alter publication supabase_realtime add table pagamentos;
alter publication supabase_realtime add table chips;
alter publication supabase_realtime add table metricas_diarias;
alter publication supabase_realtime add table eventos_campanha;

-- ===== SEEDS: configurações =====
insert into configuracoes (chave, valor, descricao) values
('campanha_ativa', 'false', 'Liga/desliga o disparo automático de mensagens'),
('modo_simulacao', 'true', 'Quando true, o disparador registra tudo mas NÃO envia mensagens reais'),
('janela_envio', '{"inicio":"08:00","fim":"20:00","tz":"America/Sao_Paulo","dias":[1,2,3,4,5,6]}', 'Janela de horário permitida para envio (dias: 0=dom ... 6=sáb)'),
('intervalo_min_segundos', '12', 'Intervalo mínimo entre mensagens do mesmo chip'),
('aquecimento', '[{"de":1,"ate":7,"limite":30},{"de":8,"ate":14,"limite":100},{"de":15,"ate":21,"limite":250},{"de":22,"ate":30,"limite":400},{"de":31,"ate":9999,"limite":500}]', 'Limite de NOVOS contatos por chip/dia conforme dias desde a ativação'),
('faixas_desconto', '{"faixas":[{"idade_min":15,"pct":60},{"idade_min":10,"pct":50},{"idade_min":5,"pct":40},{"idade_min":0,"pct":30}],"valor_minimo_pix":30,"margem_extra_pp":10}', 'Desconto por idade da dívida (anos); valor mínimo de Pix; margem extra única de negociação (pontos percentuais)'),
('followup', '{"max":3,"intervalos_horas":[24,72,168]}', 'Follow-ups para quem não responde: máximo e intervalos em horas'),
('validade_proposta_dias', '7', 'Dias de validade da proposta de quitação'),
('asaas', '{"ambiente":"sandbox","wallet_savan":"","comissao_pct":10}', 'Asaas: ambiente (sandbox|producao), walletId da SAVAN para o split, % de comissão do operador'),
('chatwoot', '{"url":"https://chatwoot.virtusdoctor.com","account_id":1,"conversa_gestor_id":null}', 'Chatwoot: URL, conta e conversa do gestor para alertas'),
('ia', '{"modelo":"gpt-4.1-mini","nome_bot":"Ana","palavras_escalonamento":["advogado","processo","procon","justiça","juiz","delegacia","golpe","polícia"]}', 'Configuração do agente de IA: modelo, nome e palavras que escalam para humano');

-- ===== SEEDS: templates =====
insert into templates_mensagem (nome, tipo, conteudo, peso) values
('Abordagem 1 — boa notícia', 'abordagem_inicial',
 '{Oi|Olá}, tudo {bem|certo}? Falo com {{primeiro_nome}}? Aqui é a {{nome_bot}}, da central de atendimento da SAVAN Calçados. {Tenho uma boa notícia em seu nome|Apareceu uma condição especial em seu nome aqui no sistema} e queria te contar rapidinho. Pode falar agora?', 3),
('Abordagem 2 — oportunidade', 'abordagem_inicial',
 '{Olá|Oi}! Sou a {{nome_bot}} e falo em nome da SAVAN Calçados 😊 Estou procurando {{primeiro_nome}} para uma oportunidade de regularização com desconto especial. {É você?|Falo com a pessoa certa?}', 3),
('Abordagem 3 — direta e leve', 'abordagem_inicial',
 '{Oi|Olá}, {{primeiro_nome}}! Aqui é a {{nome_bot}}, da SAVAN Calçados. Temos uma proposta exclusiva de encerramento definitivo de uma pendência antiga, com desconto de verdade. {Quer saber os detalhes?|Posso te explicar?}', 2),
('Follow-up 1 — lembrete leve', 'followup_1',
 '{Oi|Olá} {{primeiro_nome}}, {{nome_bot}} aqui de novo 😊 {Conseguiu ver minha mensagem?|Viu minha mensagem anterior?} A condição especial da SAVAN ainda está disponível. {Posso te explicar rapidinho?|Quer aproveitar?}', 1),
('Follow-up 2 — validade', 'followup_2',
 '{{primeiro_nome}}, a proposta de quitação com desconto especial da SAVAN está {nos últimos dias de validade|quase expirando}. Se quiser aproveitar, é só responder esta mensagem 🙏', 1),
('Follow-up 3 — despedida', 'followup_3',
 'Última mensagem, prometo 😊 A condição especial em seu nome expira em breve. Se mudar de ideia, é só chamar aqui neste número. Obrigada, {{primeiro_nome}}!', 1),
('Proposta padrão', 'proposta',
 'Encontrei aqui: existe uma pendência antiga com a SAVAN Calçados, de {{ano_divida}}, no valor atualizado de R$ {{valor_original}}. A boa notícia: consigo te oferecer a quitação definitiva por apenas R$ {{valor_final}} ({{desconto_pct}}% de desconto), válida até {{valido_ate}}. Pagando, você recebe o termo de quitação na hora. Quer aproveitar?', 1),
('Envio de Pix', 'pix',
 'Prontinho! 🎉 Segue o Pix copia e cola para quitar por R$ {{valor_final}}:

{{pix_copia_cola}}

⏳ Válido até {{valido_ate}}. Assim que o pagamento for confirmado, te envio a confirmação e o termo de quitação aqui mesmo.', 1),
('Confirmação de pagamento', 'confirmacao_pagamento',
 'Pagamento confirmado! ✅ R$ {{valor_pago}} recebido. Sua pendência com a SAVAN Calçados está QUITADA — nada mais a pagar referente a este débito. Segue abaixo seu termo de quitação. Obrigada, {{primeiro_nome}}! 💚', 1),
('Termo de quitação', 'quitacao',
 '📄 *TERMO DE QUITAÇÃO*

A SAVAN Comércio de Calçados LTDA declara, para os devidos fins, que *{{nome}}*, CPF {{cpf}}, quitou integralmente em {{data_pagamento}} a pendência registrada sob o processo {{processo}}, no valor negociado de R$ {{valor_pago}}, nada mais havendo a cobrar referente a este débito.

Guarde esta mensagem como comprovante. ✅', 1);
