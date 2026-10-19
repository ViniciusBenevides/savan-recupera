-- MC COB — papel "negociador": a pessoa que trabalha a fila do dia nas carteiras de um cobrador.
-- Vê tudo do tenant (como o visualizador) e opera (contato, agenda, acordo, mensagem), mas não mexe
-- em ajustes, chips, chaves nem usuários. Fica sozinho neste arquivo porque um valor novo de enum
-- não pode ser usado na mesma transação em que é criado.
alter type papel_usuario add value if not exists 'negociador';
