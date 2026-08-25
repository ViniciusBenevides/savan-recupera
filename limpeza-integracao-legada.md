# Remoção da integração legada

## Objetivo

Eliminar do projeto a configuração, documentação e estrutura histórica do conector que não será usado, mantendo o sistema somente no provedor oficial atual.

## Tarefas

- [x] Inventariar referências e confirmar que não há chamadas ativas no dashboard ou nas Edge Functions.
- [x] Remover variáveis e exemplos de ambiente sem expor valores.
- [x] Remover o guia operacional e a entrada correspondente da política de credenciais.
- [x] Limpar README, documentação do n8n e contexto ativo do projeto.
- [x] Normalizar migrations para que bancos novos não criem estruturas do conector legado.
- [x] Verificar busca global, tipagem e integridade dos diffs.

## Concluído quando

- [x] Nenhuma referência textual ou configuração do conector legado permanecer no projeto.
- [x] O dashboard continuar passando na verificação de tipos.
