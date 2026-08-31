# Credenciais — Política para Agentes

Esta política vale igualmente para Codex e Claude Code sempre que uma tarefa puder ler, usar, testar,
alterar, rotacionar, revogar ou documentar uma credencial do projeto.

## Regra obrigatória

Antes de tocar em uma credencial:

1. Identifique o serviço somente pelo **nome** da variável; não exiba seu valor.
2. Carregue integralmente todas as skills aplicáveis indicadas na matriz abaixo.
3. Leia integralmente o guia operacional local vinculado ao serviço, quando existir.
4. Use o `.env` da raiz como única fonte local de autenticação. Use `.env.example` apenas para nomes e
   placeholders.
5. Se não houver skill ou guia local específico, diga isso claramente. Não invente um vínculo e não use
   uma skill de outro serviço como substituta.
6. Nunca inclua valores secretos em conversa, plano, documentação, comando exibido, log, screenshot,
   diff ou commit. Testes de correspondência devem retornar apenas verdadeiro/falso ou estado sanitizado.
7. Rotação, revogação, deregistro, exclusão e troca de vínculo exigem autorização específica e avaliação
   do impacto antes da execução.

## Proibição de MCP

**Não usar MCP** para descobrir, buscar, validar, ler, gravar ou rotacionar credenciais, nem para operar
os serviços desta matriz. Essa regra prevalece mesmo quando uma skill recomendar MCP como primeira opção.

Para uma operação explicitamente solicitada, use a documentação local, as skills aplicáveis e as
credenciais do `.env`; quando necessário, use apenas a API ou CLI oficial do serviço. Não autentique por
conector MCP e não copie segredos para arquivos auxiliares.

## Matriz do `.env`

| Variáveis / prefixo | Serviço | Skills obrigatórias, se disponíveis | Guia operacional |
|---|---|---|---|
| `ASAAS_*` | Asaas | Não há skill específica instalada | [Asaas](<Asaas — Guia Operacional.md>) |
| `CHATWOOT_*` | Chatwoot | Não há skill específica instalada | [Chatwoot](<Chatwoot — Guia Operacional.md>) |
| `CNPJBIZ_*` | CNPJ Biz | Não há skill específica instalada | **Não existe guia local atualmente** |
| `COOLIFY_*` | Coolify | Não há skill específica instalada | **Não existe guia local atualmente** |
| `EVOLUTION_*` | Evolution API / Baileys (WhatsApp) | Não há skill específica instalada | [Baileys](<Baileys — Guia Operacional.md>) |
| `HOSTINGER_*` | Hostinger | Não há skill específica instalada | [Hostinger](<Hostinger — Guia Operacional.md>) |
| `META_*` | Meta / WhatsApp Cloud API | Não há skill específica instalada | [Meta](<Meta — Guia Operacional.md>) |
| `N8N_*` | n8n | [`n8n-skills` (Codex)](<../.agents/skills/n8n-skills/SKILL.md>) e [`n8n-skills` (Claude)](<../.claude/skills/n8n-skills/SKILL.md>) | [n8n](<n8n — Guia Operacional.md>) |
| `OPENAI_*` | OpenAI | `openai-docs` no Codex, quando disponível; não há cópia local equivalente para Claude | **Não existe guia local atualmente** |
| `SALVY_*` | Salvy | Não há skill específica instalada | [Salvy](<Salvy — Guia Operacional.md>) |
| `SUPABASE_*` | Supabase / Postgres | Ver carregamento obrigatório abaixo | **Não existe guia local atualmente** |
| `VERCEL_*` | Vercel | [`vercel-cli-with-tokens` (Codex)](<../.agents/skills/vercel-cli-with-tokens/SKILL.md>) e [`vercel-cli-with-tokens` (Claude)](<../.claude/skills/vercel-cli-with-tokens/SKILL.md>) | [Vercel](<Vercel — Guia Operacional.md>) |

Os guias de Autentique, Neon e Resend também devem ser carregados se variáveis desses serviços forem
adicionadas futuramente ao `.env`:
[Autentique](<Autentique — Guia Operacional.md>), [Neon](<Neon — Guia Operacional.md>) e
[Resend](<Resend — Guia Operacional.md>).

## Carregamento obrigatório para Supabase

Em qualquer tarefa relacionada a uma credencial `SUPABASE_*` ou a Supabase/Postgres, carregar antes de
agir:

- [`supabase` do projeto](<../.agents/skills/supabase/SKILL.md>);
- [`supabase-postgres-best-practices` do projeto](<../.agents/skills/supabase-postgres-best-practices/SKILL.md>);
- [`supabase` do plugin oficial](<C:/Users/vsben/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md>);
- [`supabase-postgres-best-practices` do plugin oficial](<C:/Users/vsben/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase-postgres-best-practices/SKILL.md>).

No Claude Code, carregar também as cópias espelhadas em
[`.claude/skills/supabase`](<../.claude/skills/supabase/SKILL.md>) e
[`.claude/skills/supabase-postgres-best-practices`](<../.claude/skills/supabase-postgres-best-practices/SKILL.md>)
quando elas estiverem disponíveis. A proibição de MCP continua valendo para todas essas skills.

## Regra adicional para Meta/WhatsApp

Antes de qualquer ação com `META_*`, ler também o §38 de `contexto-projeto.md`. O número oficial da MC
CRED e sua WABA estão permanentemente banidos. Não executar deregistro, reatribuição, recriação de ativos
ou tentativa de evasão sem uma decisão explícita, documentada e compatível com a orientação formal da
Meta ou de um BSP oficial.

## Regra adicional para Evolution/Baileys

A sessão de WhatsApp do Baileys **é a credencial** e não tem substituto: não existe token para rotacionar.
O que autentica cada número é um par de chaves Signal guardado no banco da Evolution, equivalente a uma
chave SSH privada.

- Nunca exibir, logar, versionar ou copiar o conteúdo do estado de auth (`creds`/`keys`).
- Nunca desconectar, deslogar ou apagar uma instância sem autorização específica: perder a sessão obriga
  a um novo registro por QR, e um número que já rodou automação frequentemente não volta a registrar.
- Enviar mensagem por esse canal atinge uma pessoa real e não tem desfazer — confirmar antes, sempre.
- Ler integralmente o [guia do Baileys](<Baileys — Guia Operacional.md>), em especial a §8 (sinais de ban)
  e a §10 (regras de segurança), antes de qualquer operação no canal.
