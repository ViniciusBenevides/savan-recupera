-- Token de segurança da Z-API por chip (cada conta Z-API tem o seu).
-- Antes era um env global (ZAPI_CLIENT_TOKEN); como o produto é multi-conta,
-- cada chip guarda o próprio. Nullable: chips antigos caem no fallback do env.
alter table chips_credenciais add column if not exists zapi_client_token text;
