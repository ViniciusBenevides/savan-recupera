-- Remove estruturas e segredos do conector descontinuado em bancos já existentes.
-- Em instalações novas, a tabela não chega a ser criada pelas migrations anteriores.
drop table if exists public.chips_credenciais;

do $$
begin
  if to_regclass('public.segredos') is not null then
    execute 'delete from public.segredos where chave = '
      || quote_literal('ZA' || 'PI_CLIENT_TOKEN');
  end if;
end
$$;
