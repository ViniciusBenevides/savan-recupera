-- 021_chat_lid — guarda o @lid (identificador privado do WhatsApp) por telefone, para casar
-- respostas de entrada de forma determinística mesmo quando o WhatsApp oculta o número (privacidade).
-- Usado pelo bot-turno (v10+): casa a entrada @lid -> devedor e endereça a SAÍDA via Z-API ao @lid.
-- Obs.: convive com a 021_config_templates_por_cobrador.sql (mesmo número, escopos diferentes);
-- ambas foram aplicadas via MCP no projeto e são aditivas/idempotentes.
alter table telefones_devedor add column if not exists chat_lid text;
create index if not exists idx_telefones_chat_lid on telefones_devedor (chat_lid) where chat_lid is not null;
