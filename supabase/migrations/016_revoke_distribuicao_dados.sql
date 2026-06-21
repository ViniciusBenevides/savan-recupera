-- SAVAN Recupera — 016: fecha o advisor de SECURITY DEFINER
-- fn_distribuicao_dados é chamada pela API via service_role; não precisa ficar exposta
-- a usuários logados na API REST. Revoga execute de authenticated também.

revoke execute on function fn_distribuicao_dados(bigint) from authenticated;
