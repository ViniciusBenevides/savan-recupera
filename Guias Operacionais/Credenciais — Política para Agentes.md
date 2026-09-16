# Credenciais — Política para Agentes

Esta política vale igualmente para Codex e Claude Code sempre que uma tarefa puder ler, usar, testar,
alterar, rotacionar, revogar ou documentar uma credencial do projeto.

## Regra obrigatória

Antes de tocar em uma credencial:

1. Identifique o serviço somente pelo **nome** da variável; não exiba seu valor.
2. Carregue integralmente todas as skills aplicáveis indicadas na matriz abaixo.
3. Leia integralmente o guia operacional local vinculado ao serviço, quando existir.
4. Se não houver skill ou guia local específico, diga isso claramente. Não invente um vínculo e não use
   uma skill de outro serviço como substituta.
5. Nunca inclua valores secretos em conversa, plano, documentação, comando exibido, log, screenshot,
   diff ou commit. Testes de correspondência devem retornar apenas verdadeiro/falso ou estado sanitizado.
6. Rotação, revogação, deregistro, exclusão e troca de vínculo exigem autorização específica e avaliação
   do impacto antes da execução.

## Matriz do `.env`

| Variáveis / prefixo    | Serviço                                                                           | Skills obrigatórias, se disponíveis                                                                                                                                            | Guia operacional                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `ASAAS_*`             | Asaas                                                                              | Não há skill específica instalada                                                                                                                                             | [Asaas](<Asaas — Guia Operacional.md>)                                                                                |
| `BAILEYS_API_*`       | baileys-api (fazer-ai) — canal Baileys nativo do Chatwoot                         | Não há skill específica instalada                                                                                                                                             | [baileys-api (Chatwoot)](<baileys-api (Chatwoot) — Guia Operacional.md>) e [Baileys](<Baileys — Guia Operacional.md>) |
| `CHATWOOT_*`          | Chatwoot                                                                           | Não há skill específica instalada                                                                                                                                             | [Chatwoot](<Chatwoot — Guia Operacional.md>)                                                                          |
| `CNPJBIZ_*`           | CNPJ Biz                                                                           | Não há skill específica instalada                                                                                                                                             | **Não existe guia local atualmente**                                                                           |
| `COOLIFY_*`           | Coolify                                                                            | Não há skill específica instalada                                                                                                                                             | **Não existe guia local atualmente**                                                                           |
| `ELEVEN_LABS_API_KEY` | ElevenLabs (text-to-speech)                                                        | Não há skill específica instalada                                                                                                                                             | [ElevenLabs](<ElevenLabs — Guia Operacional.md>)                                                                      |
| `EVOLUTION_*`         | Evolution API / Baileys (WhatsApp)                                                 | Não há skill específica instalada                                                                                                                                             | [Baileys](<Baileys — Guia Operacional.md>)                                                                            |
| `HOSTINGER_*`         | Hostinger                                                                          | Não há skill específica instalada                                                                                                                                             | [Hostinger](<Hostinger — Guia Operacional.md>)                                                                        |
| `META_*`              | Meta / WhatsApp Cloud API                                                          | Não há skill específica instalada                                                                                                                                             | [Meta](<Meta — Guia Operacional.md>)                                                                                  |
| `N8N_*`               | n8n                                                                                | [`n8n-skills` (Codex)](../.agents/skills/n8n-skills/SKILL.md) e [`n8n-skills` (Claude)](../.claude/skills/n8n-skills/SKILL.md)                                                 | [n8n](<n8n — Guia Operacional.md>)                                                                                    |
| `OPENAI_*`            | OpenAI                                                                             | `openai-docs` no Codex, quando disponível; não há cópia local equivalente para Claude                                                                                      | **Não existe guia local atualmente**                                                                           |
| `SALVY_*`             | Salvy                                                                              | Não há skill específica instalada                                                                                                                                             | [Salvy](<Salvy — Guia Operacional.md>)                                                                                |
| `SUPABASE_*`          | Supabase / Postgres                                                                | Ver carregamento obrigatório abaixo                                                                                                                                             | **Não existe guia local atualmente**                                                                           |
| `TWILIO_*`            | Twilio (voz / WhatsApp Business Calling) —**ainda não existe no `.env`** | Não há skill específica instalada                                                                                                                                             | [Twilio](<Twilio — Guia Operacional.md>)                                                                              |
| `VERCEL_*`            | Vercel                                                                             | [`vercel-cli-with-tokens` (Codex)](../.agents/skills/vercel-cli-with-tokens/SKILL.md) e [`vercel-cli-with-tokens` (Claude)](../.claude/skills/vercel-cli-with-tokens/SKILL.md) | [Vercel](<Vercel — Guia Operacional.md>)                                                                              |

Os guias de Autentique, Neon e Resend também devem ser carregados se variáveis desses serviços forem
adicionadas futuramente ao `.env`:
[Autentique](<Autentique — Guia Operacional.md>), [Neon](<Neon — Guia Operacional.md>) e
[Resend](<Resend — Guia Operacional.md>).

## Carregamento obrigatório para Supabase

Em qualquer tarefa relacionada a uma credencial `SUPABASE_*` ou a Supabase/Postgres, carregar antes de
agir:

- [`supabase` do projeto](../.agents/skills/supabase/SKILL.md);
- [`supabase-postgres-best-practices` do projeto](../.agents/skills/supabase-postgres-best-practices/SKILL.md);
- [`supabase` do plugin oficial](C:/Users/vsben/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md);
- [`supabase-postgres-best-practices` do plugin oficial](C:/Users/vsben/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase-postgres-best-practices/SKILL.md).

No Claude Code, carregar também as cópias espelhadas em
[`.claude/skills/supabase`](../.claude/skills/supabase/SKILL.md) e
[`.claude/skills/supabase-postgres-best-practices`](../.claude/skills/supabase-postgres-best-practices/SKILL.md)
quando elas estiverem disponíveis. A proibição de MCP continua valendo para todas essas skills.

## Regra adicional para Evolution/Baileys

Vale para os **dois** transportes Baileys do projeto: `EVOLUTION_*` (Evolution API) e `BAILEYS_API_*`
(baileys-api da fazer-ai, o canal nativo do Chatwoot). São serviços diferentes, com credenciais e guias
diferentes, mas o risco é o mesmo — quem está do outro lado é o WhatsApp, não uma API com contrato.

A sessão de WhatsApp do Baileys **é a credencial** e não tem substituto: não existe token para rotacionar.
O que autentica cada número é um par de chaves Signal guardado no banco do provedor — Postgres na
Evolution, Redis no baileys-api —, equivalente a uma chave SSH privada.

- Nunca exibir, logar, versionar ou copiar o conteúdo do estado de auth (`creds`/`keys`).
- Nunca desconectar, deslogar ou apagar uma instância sem autorização específica: perder a sessão obriga
  a um novo registro por QR, e um número que já rodou automação frequentemente não volta a registrar.
- Enviar mensagem por esse canal atinge uma pessoa real e não tem desfazer — confirmar antes, sempre.
- Ler integralmente o [guia do Baileys](<Baileys — Guia Operacional.md>), em especial a §8 (sinais de ban)
  e a §10 (regras de segurança), antes de qualquer operação no canal.
- Quando a operação for no canal nativo do Chatwoot (`BAILEYS_API_*`, `chips.conector = 'baileys_chatwoot'`), ler **também** o [guia do baileys-api](<baileys-api (Chatwoot) — Guia Operacional.md>):
  a autenticação, o endereço de cada número e o caminho de pareamento são outros, e quem abre a conexão
  é o Chatwoot, não o painel.

## Regra adicional para Twilio

Não há credencial `TWILIO_*` no `.env` hoje e não há código Twilio no repositório. Antes de criar qualquer
uma, ler integralmente o [guia da Twilio](<Twilio — Guia Operacional.md>).

- Use **API Key** (`SK...` + secret) para chamar a API. O `TWILIO_AUTH_TOKEN` é a chave-mestra da conta e
  deve ficar restrito à validação de assinatura de webhook (`X-Twilio-Signature`).
- **Comprar número gera cobrança mensal recorrente** e exige um Regulatory Bundle aprovado com CNPJ,
  endereço no Brasil e documentos societários. Exige autorização específica.
- **Liberar um número é irreversível** — o mesmo número não volta. Nunca executar `DELETE` em
  `IncomingPhoneNumbers` sem autorização explícita.
- **Iniciar uma chamada atinge uma pessoa real e não tem desfazer** — confirmar antes, sempre. Vale
  também para teste: em conta paga não existe sandbox de voz.
- **Discagem ativa (outbound) para devedores depende de decisão jurídica documentada.** Ver §10 do guia
  e o §38 de `contexto-projeto.md`: o padrão de abordagem fria já custou o banimento permanente do canal
  oficial da Meta, e no canal de voz o interlocutor é a Anatel/Procon.
- WhatsApp Business Calling exige uma WABA oficial aprovada. A da MC CRED está banida. Não criar ativos
  novos para contornar o banimento — a regra de Meta/WhatsApp acima continua valendo aqui.
