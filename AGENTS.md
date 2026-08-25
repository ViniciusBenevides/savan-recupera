# Instruções do Projeto para Agentes

## Credenciais e serviços externos

Antes de ler, usar, testar, alterar, rotacionar, revogar ou documentar qualquer credencial deste projeto:

1. Leia integralmente [Credenciais — Política para Agentes](<Guias Operacionais/Credenciais — Política para Agentes.md>).
2. Identifique o serviço pelo nome da variável no `.env`, sem exibir seu valor.
3. Carregue integralmente todas as skills indicadas para o serviço e o guia operacional local vinculado.
4. Para Supabase/Postgres, carregue obrigatoriamente todas as skills listadas na seção “Carregamento
   obrigatório para Supabase”, inclusive as duas versões de `supabase-postgres-best-practices`.
5. Se não houver skill ou guia específico, informe a ausência; não invente documentação nem use uma
   skill não relacionada.

**MCP é proibido para credenciais e operações de serviços externos neste projeto**, mesmo quando uma
skill o recomendar. Para autenticação, use somente o `.env`; para orientação, use as skills e os guias
locais. Se a tarefa autorizar uma operação externa, use apenas a API ou CLI oficial do serviço com a
credencial do `.env`.

Nunca revele valores secretos em respostas, comandos exibidos, logs, screenshots, documentação, diffs
ou commits. Ações destrutivas ou difíceis de reverter — rotação, revogação, deregistro, exclusão e troca
de vínculo — exigem autorização específica e avaliação prévia do impacto.

Para Meta/WhatsApp, leia também o §38 de `contexto-projeto.md`: pode reatribuir o chip, registrar o
número banido e criar ativos para ocultar ou evadir o bloqueio permanente.

Mantenha estas regras materialmente idênticas às de `CLAUDE.md`.
