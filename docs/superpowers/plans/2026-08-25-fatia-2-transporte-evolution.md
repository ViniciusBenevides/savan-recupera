# Fatia 2 — Transporte: enviar pela Evolution, espelhar no Chatwoot

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Dar ao sistema um caminho de saída pela Evolution API, com presença e "digitando…"
proporcionais ao texto, e tirar a sondagem `on_whatsapp` de vez.

**Architecture:** As **decisões** do transporte (quanto tempo digitar, o que um erro de envio significa,
que status um estado de conexão vira) ficam num módulo puro e testado. O **I/O** fica em dois clientes
finos: um em Deno para as Edge Functions, um em TypeScript para o dashboard provisionar número e ler QR.
O envio ganha uma Edge Function nova, `enviar-mensagem`, em vez de alterar o `campanha-lote` — assim
nada do caminho atual quebra enquanto a Evolution não estiver no ar.

**Tech Stack:** TypeScript em Deno · Next.js 15 App Router · Evolution API v2 · testes com
`jsr:@std/assert` via `npx -y deno@2`

**Depende de:** Fatia 1 (`chips.conector`, `chips.instancia_evolution`, `_shared/conector.ts`).

---

## A lição do §36 está no centro desta fatia

Em 12/08/2026 o `contato-criar` chamou `on_whatsapp` numa inbox Meta, recebeu `HTTP 200` com corpo
`null`, interpretou como "número não existe" e **descartou 10 itens da fila como `sem_whatsapp`** —
inclusive um número de teste válido. A campanha inteira foi contaminada por uma indisponibilidade lida
como invalidez.

Por isso a regra desta fatia, que o código precisa tornar impossível de violar:

> **Só marque `sem_whatsapp` diante de um sinal explícito e reconhecido de que o número não existe.
> Qualquer outra coisa — timeout, 500, corpo estranho, erro desconhecido — é `falha`, que retenta.**

`classificarErroEnvio` falha fechada por construção: o padrão é `falha`, e `sem_whatsapp` exige match
positivo.

---

## Pré-requisito

```bash
npx -y deno@2 test supabase/functions/_shared/
```

Esperado: `ok | 35 passed | 0 failed` (a linha de base deixada pela Fatia 1).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/functions/_shared/evolution.ts` (criar) | Decisões puras do transporte: JID, tempo de digitação, classificação de erro, estado→status |
| `supabase/functions/_shared/evolution.test.ts` (criar) | Testes do acima |
| `supabase/functions/_shared/evolution-client.ts` (criar) | I/O com a Evolution a partir das Edge Functions |
| `supabase/functions/enviar-mensagem/index.ts` (criar) | Edge Function de envio: aplica ritmo de digitação e devolve o id real da mensagem |
| `dashboard/src/lib/evolution.ts` (criar) | I/O com a Evolution a partir do painel: criar instância, QR, estado, ligar Chatwoot |
| `dashboard/src/app/api/chips/[id]/conectar/route.ts` (criar) | Provisiona a instância e devolve o QR |
| `supabase/functions/contato-criar/index.ts` (modificar) | **Remove a sondagem `on_whatsapp`** |

---

## Task 1: Decisões puras do transporte

**Files:**
- Create: `supabase/functions/_shared/evolution.ts`
- Test: `supabase/functions/_shared/evolution.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Crie `supabase/functions/_shared/evolution.test.ts` com o conteúdo do arquivo homônimo entregue nesta
fatia. Ele cobre quatro funções:

- `numeroParaJid` — E.164 → `55...@s.whatsapp.net`, tolerante a `+`, espaço, parêntese e hífen
- `tempoDigitacao` — proporcional ao texto, com piso, teto e variação determinística (random injetável)
- `classificarErroEnvio` — **falha fechada**: só sinal reconhecido vira `sem_whatsapp`
- `estadoConexaoParaStatus` — `open`→`conectado`, `close`+401→`banido`, `close`→`desconectado`

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx -y deno@2 test supabase/functions/_shared/evolution.test.ts
```

Esperado: FALHA com `Module not found` apontando para `./evolution.ts`.

- [ ] **Step 3: Escrever a implementação**

Crie `supabase/functions/_shared/evolution.ts` conforme entregue nesta fatia.

Pontos que **não** podem ser simplificados:

1. `classificarErroEnvio` começa em `falha` e só sai disso com match positivo (lição do §36).
2. `tempoDigitacao` recebe a função de aleatoriedade por parâmetro, senão não dá para testar.
3. `estadoConexaoParaStatus` mapeia `401` para `banido`, não `desconectado` — reconectar não resolve e
   o failover tem que disparar (ver §8 do guia do Baileys).

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx -y deno@2 test supabase/functions/_shared/evolution.test.ts
```

Esperado: `ok | 14 passed | 0 failed`.

- [ ] **Step 5: Suíte inteira**

```bash
npx -y deno@2 test supabase/functions/_shared/
```

Esperado: `ok | 49 passed | 0 failed` (35 + 14).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/evolution.ts supabase/functions/_shared/evolution.test.ts
git commit -m "feat(shared): decisoes puras do transporte evolution"
```

---

## Task 2: Cliente da Evolution para as Edge Functions

**Files:**
- Create: `supabase/functions/_shared/evolution-client.ts`

Cliente fino, sem decisão de negócio: só monta a chamada e devolve o resultado cru mais o que
`classificarErroEnvio` disse. Endpoints usados (Evolution v2):

| Chamada | Endpoint |
|---|---|
| Enviar texto | `POST /message/sendText/{instance}` — corpo `{ number, text, delay, presence, linkPreview }` |
| Estado da conexão | `GET /instance/connectionState/{instance}` |
| Presença avulsa | `POST /chat/sendPresence/{instance}` |

> **Sobre `delay` + `presence`:** a semântica exata do `delay` é [questão em aberto no upstream](https://github.com/EvolutionAPI/evolution-api/issues/1639).
> Por isso o **cálculo do tempo é nosso** (`tempoDigitacao`), determinístico e testado; o `delay` só o
> transporta. Se um dia o comportamento da Evolution mudar, muda um número, não a regra.

- [ ] **Step 1..N:** criar o arquivo conforme entregue, depois `npx -y deno@2 check` no módulo e commit.

---

## Task 3: Edge Function `enviar-mensagem`

**Files:**
- Create: `supabase/functions/enviar-mensagem/index.ts`

Função nova, **aditiva**: o `campanha-lote` e o n8n W01 continuam funcionando como estão. Ela recebe
`{ chip_id, numero_e164, texto, simulacao? }`, carrega o chip, confirma com `chipPodeAbordar` (Fatia 1)
que há caminho de saída, calcula o tempo de digitação, chama a Evolution e devolve
`{ ok, message_id, delay_ms, motivo? }`.

**Por que função nova em vez de mexer no `campanha-lote`:** o `campanha-lote` é o disparador crítico, tem
469 linhas e uma versão deployada rodando. Trocar o caminho de envio dentro dele, sem a Evolution no ar
para testar, é o tipo de mudança que já custou uma campanha (§36). A troca do elo no n8n é um passo
separado, executado quando houver o que testar.

- [ ] **Step 1..N:** criar conforme entregue, `deno check`, commit.

---

## Task 4: Cliente e rota de provisionamento no painel

**Files:**
- Create: `dashboard/src/lib/evolution.ts`
- Create: `dashboard/src/app/api/chips/[id]/conectar/route.ts`

O painel precisa de: criar a instância, pedir o QR, ler o estado e ligar o Chatwoot. Os campos da
integração Chatwoot estão documentados na §11 do
[guia do Baileys](<../../../Guias Operacionais/Baileys — Guia Operacional.md>) — `mergeBrazilContacts`
é obrigatório no Brasil.

- [ ] **Step 1..N:** criar conforme entregue, `npx tsc --noEmit`, `npm run build`, commit.

---

## Task 5: Tirar a sondagem `on_whatsapp`

**Files:**
- Modify: `supabase/functions/contato-criar/index.ts` (bloco das linhas ~72–94)

Hoje o bloco só é pulado para `meta_cloud`. Passa a ser pulado **sempre**: a decisão do Q17 é cortar a
sondagem por completo — ela custava 1,25% de desperdício e entregava um padrão de robô que o §31 lista
como causa de restrição, além de a doc do Baileys avisar que USync agressivo é limitado.

O que substitui: o envio falha, `classificarErroEnvio` diz se foi `sem_whatsapp`, e só então o telefone
é marcado. **Invalidez passa a ser conclusão de um envio real, não de uma sondagem.**

- [ ] **Step 1:** remover o bloco de sondagem, mantendo `jidE164 = telefone_e164`.
- [ ] **Step 2:** `npx -y deno@2 check supabase/functions/contato-criar/index.ts`
- [ ] **Step 3:** commit.

---

## Definição de pronto

- [ ] 49 testes Deno passando
- [ ] `tsc --noEmit` limpo e `npm run build` OK
- [ ] `contato-criar` não chama mais `on_whatsapp` para nenhum conector
- [ ] `enviar-mensagem` existe, type-checa, e recusa chip sem caminho de saída
- [ ] Nenhuma função existente teve o caminho de envio trocado
- [ ] Nada aplicado em produção

## O que esta fatia deliberadamente NÃO faz

- **Não troca o elo de envio no n8n W01.** Precisa da Evolution no ar para testar; é um passo de
  operação, não de código.
- **Não sobe a Evolution no Coolify** nem cria instância real. Exige autorização específica.
- Não mexe em dossiê, índice de saúde nem failover (**Fatia 3**), opt-in (**Fatia 4**) ou ritmo
  (**Fatia 5**).
