# n8n — Orquestração SAVAN Recupera

Os workflows n8n são **finos de propósito**: só cuidam de _timing_ (agenda/cron),
_webhook_ e _I/O_ com Chatwoot/Z-API. Toda a lógica pesada (negociação, seleção de lote,
Pix, métricas) mora nas **Edge Functions do Supabase** (`supabase/functions/`), que são
testáveis por `curl` e estão sempre no ar. Cada workflow basicamente chama uma Edge Function
por HTTP com o `service_role` como `Bearer`.

> Tudo aqui é **recriável**: `python n8n/criar_workflows.py` cria/atualiza os 5 workflows
> pelo nome (idempotente) e já aplica a tag de organização.

---

## Os 5 workflows do produto

| Workflow | Gatilho | Chama (Edge Function) | O que faz |
|---|---|---|---|
| **SAVAN W01 - Disparador** | Schedule, **1 min** | `campanha-lote` → `contato-criar` → `campanha-registrar` | Pega o lote permitido, valida WhatsApp, cria contato/conversa no Chatwoot, envia a 1ª mensagem (respeitando _Modo simulação_) e registra. Espera 12 s entre envios. |
| **SAVAN W02 - Bot Negociador** | Webhook `POST /webhook/savan-bot` | `bot-turno` | Recebe o evento `message_created` do Chatwoot, filtra (só mensagem recebida, não-privada, bot ligado), chama o cérebro do bot e devolve a(s) resposta(s) ao Chatwoot. |
| **SAVAN W07 - Follow-up** | Schedule, **5 min** | `campanha-followup` | Reengaja quem não respondeu (até 3×), respeitando a janela. |
| **SAVAN W08 - Monitor de Chips** | Schedule, **15 min** | `chips-monitor` | Consulta o status Z-API de cada chip e atualiza saúde/status. |
| **SAVAN W09 - Métricas** | Schedule, **5 min** | `metricas-sync` | Reabre itens presos, recalcula métricas do dia, promove chips aquecidos→ativos. |

**Webhook do Chatwoot** (inbox/integração) deve apontar para
`https://<seu-n8n>/webhook/savan-bot`, evento `message_created`.

### Contrato W01 (passo a passo)
`campanha-lote` devolve `{ itens: [...] }`; cada item já traz `inbox_id`, `telefone_e164`,
`telefone_id`, `devedor_id`, `devedor_nome`, `processo`, `valor_divida`, `mensagem`,
`delay_typing`, `simulacao`. O W01 então:
1. **Criar contato** (`contato-criar`) → `{ exists, conversation_id, contact_id }`.
2. **Tem WhatsApp?** (IF `exists`): se não, **Registrar sem WA** (`campanha-registrar status=sem_whatsapp`).
3. **É simulação?** (IF): se sim, só **Registrar enviado**; se não, **Enviar msg** (Chatwoot) e depois registrar.
4. **Aguardar 12 s** e voltar ao loop.

---

## Pasta "Cobrador Maurelio v2" vs. tag `SAVAN`

A **API pública do n8n não gerencia pastas** (testado: `GET /api/v1/folders` → 404;
`/api/v1/projects` → 403 por licença). Ou seja: **não dá para mover os workflows para a pasta
"Cobrador Maurelio v2" por código** — isso só na interface web, arrastando.

O que a API permite é **tag**. Por isso os 5 workflows (+ o `Setup Chatwoot`) recebem a tag
**`SAVAN`** — assim você filtra todos de uma vez no n8n. Para deixá-los na pasta:

1. No n8n, filtre por tag **`SAVAN`** (ou busque "SAVAN").
2. Selecione os workflows e **arraste para a pasta "Cobrador Maurelio v2"** (1× só).
3. A tag continua valendo — se um dia recriar via script, é só arrastar de novo.

Scripts:
- `python n8n/organizar_tags.py` — (re)aplica a tag `SAVAN` em tudo que começa com "SAVAN".
- `python n8n/criar_workflows.py` — recria os 5 workflows e já aplica a tag.

---

## Review: n8n ✕ código — achados e **correções aplicadas**

Comparei `criar_workflows.py` com as Edge Functions reais. **Os contratos batem** (campos de
entrada/saída de `campanha-lote`, `contato-criar`, `campanha-registrar`, `bot-turno`). Os pontos
de atenção encontrados foram **todos corrigidos**:

1. ✅ **W02 — escalada para humano agora é visível no Chatwoot.** Antes, o nó "Preparar envios"
   empacotava um item `{ escalar }` sem texto e o "Enviar resposta" tentava mandar
   `content: undefined`. Agora há um **ramo dedicado**: `Bot responder → Escalou?` (IF
   `!!escalar`) `→ Labels atuais` (GET) `→ Marcar escalado` (POST mesclando a label
   `escalado-humano`, pois no Chatwoot o POST de labels **substitui** o conjunto) `→ Nota interna`
   (mensagem privada com o motivo da escalada). O envio das mensagens segue em paralelo.

2. ✅ **`campanha-registrar` (sem_whatsapp) preserva a carteira.** No branch `sem_whatsapp`, antes
   de inserir a linha de retry (próximo telefone), agora busca `devedores.carteira_id` (como já
   fazia no branch `enviado`), em vez de gravar `carteira_id = null`. Aplicado no repo
   (`supabase/functions/campanha-registrar/index.ts`) **e** deployado (versão 3).

3. ✅ **Workflow `SAVAN W01 - Setup Chatwoot` documentado** (ver abaixo). É um utilitário de
   **setup único** (manual), por isso não está no `criar_workflows.py` — correto que fique fora do
   runtime.

4. ✅ **Fontes de `chips-monitor` e `metricas-sync` trazidas para o repo**
   (`supabase/functions/chips-monitor/index.ts` e `.../metricas-sync/index.ts`), na versão
   self-contained idêntica à deployada. Agora `supabase/functions/` tem as 9 funções.

---

## `SAVAN W01 - Setup Chatwoot` (utilitário de setup, manual)

Workflow **inativo** com gatilho **manual** (`Executar uma vez`) — roda **uma vez** ao preparar
uma conta do Chatwoot, não faz parte do runtime. O que ele faz:

1. **Configurações** (Set) — URL do Chatwoot, id da conta, credenciais de admin.
2. **Login Chatwoot** (`/auth/sign_in`) — pega o token de acesso.
3. **Criar labels** — cria as labels do produto (`cobranca-savan`, etc.) via
   `POST /api/v1/accounts/{id}/labels`.
4. **Criar atributos** — cria os atributos customizados de contato (`devedor_id`, `processo`,
   `valor_divida`, …) via `POST /api/v1/accounts/{id}/custom_attribute_definitions`.

Mantê-lo na pasta/tag SAVAN como referência de setup é o suficiente; não precisa ativar.

---

## Outros workflows na instância — **não mexer**

A instância é **compartilhada** com outros clientes (Secretária, Imobiliária Ulysses, etc.).
**Só os 6 com a tag `SAVAN` são do Cobrador Maurelio v2.** Todos os demais workflows pertencem a
outros clientes e **não devem ser tocados** (alguns estão ativos, rodando para esses clientes).
A organização aqui se limita ao que é do produto — nenhuma limpeza é feita fora da tag `SAVAN`.

---

## Referência

A pasta `WORKFLOWS/` (na raiz, **gitignored**) guarda exports `.json` de workflows de
referência de terceiros (Secretária/Asaas/Z-API) usados como base — **não** são os workflows
reais do SAVAN. Os reais são gerados por `criar_workflows.py`.
