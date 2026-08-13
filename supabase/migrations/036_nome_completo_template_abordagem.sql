-- Usa o nome completo no parâmetro {{1}} do template aprovado de abordagem da SAVAN.
-- O texto do template Meta não muda; somente a variável enviada para o placeholder.
-- Idempotente e restrito à referência deste template.

update public.configuracoes
set valor = jsonb_set(valor, '{variaveis}', '["nome"]'::jsonb, true)
where chave = 'meta_abordagem_template'
  and valor->>'name' = 'savan_abordagem_identidade'
  and valor->>'language' = 'pt_BR';
