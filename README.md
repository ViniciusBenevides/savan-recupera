# SAVAN Recupera

> **Case real de portfólio — cliente anonimizado.** Nomes, credenciais, identificadores de
> projeto e números exatos da carteira foram removidos ou generalizados.

Plataforma de **recuperação extrajudicial de crédito por WhatsApp** para a carteira de um
**varejista de calçados** (~50 mil devedores · carteira na casa dos R$ 10 mi). O bot oferece
**quitação voluntária com desconto**, gera Pix com **split automático 90% credor / 10% operador**
e tudo é operável por um **painel web** — sem precisar tocar em código.

> ⚠️ **Antes de qualquer disparo real:** as dívidas têm média de ~15 anos e estão
> juridicamente prescritas. O bot **nunca** ameaça, **nunca** menciona Serasa/negativação
> e responde com honestidade sobre prescrição. É **obrigatório** ter o contrato de
> prestação de serviço de cobrança + DPA (LGPD) assinado com o credor antes de ligar a
> campanha em produção.

---

## Arquitetura

| Camada | Tecnologia | O quê |
|---|---|---|
| **Banco** | Supabase Postgres | Schema completo em `supabase/migrations/`. ~50 mil devedores, ~215 mil telefones. |
| **Cérebro** | Supabase Edge Functions `supabase/functions/` | 9 funções: `campanha-lote`, `campanha-registrar`, `contato-criar`, `bot-turno`, `gerar-pix`, `webhook-asaas`, `campanha-followup`, `chips-monitor`, `metricas-sync`. |
| **Orquestração** | n8n | 5 workflows finos: `W01 Disparador`, `W02 Bot Negociador`, `W07 Follow-up`, `W08 Monitor de Chips`, `W09 Métricas`. |
| **Atendimento** | Chatwoot (fork fazer.ai) | Inboxes por chip, labels, atributos, webhook → W02. Humano assume direto aqui. |
| **Pagamentos** | Asaas | Pix com split. Webhook → Edge `webhook-asaas`. |
| **Painel** | Next.js 15 na Vercel | Dashboard operável por usuário não-técnico. |
| **Import** | `import/importar_planilha.py` | Lê a planilha-fonte, normaliza e popula o banco. |

**Decisão de arquitetura central:** o trabalho pesado (negociação, seleção de lote, Pix,
webhook) fica nas **Edge Functions** (testáveis via curl, sempre no ar), não em nós n8n
complexos. Os workflows n8n são finos: só orquestram timing e I/O com Chatwoot/Z-API.

---

## Como funciona (fluxo)

1. **W01 Disparador** (n8n, a cada 1 min) chama `campanha-lote`, que aplica as regras
   (campanha ligada? dentro do horário? limite de aquecimento do chip?), seleciona um
   lote da fila e devolve as mensagens já prontas. O n8n cria o contato/conversa no
   Chatwoot (`contato-criar`), envia, registra (`campanha-registrar`) e espera 12s.
2. O devedor responde → Chatwoot dispara o **webhook → W02 Bot Negociador** → `bot-turno`
   (OpenAI) confirma identidade, apresenta proposta, gera o Pix (`gerar-pix`) e responde.
3. Devedor paga → Asaas chama `webhook-asaas` → status vira "pago", o split cai (90/10),
   e o devedor recebe **confirmação + termo de quitação**.
4. Sem resposta? **W07 Follow-up** reengaja até 3× e encerra.
5. **W08** monitora a conexão dos chips; **W09** consolida as métricas.

Tudo o que o operador precisa mexer (ligar campanha, descontos, mensagens, chips) está no
painel. **O n8n roda sozinho.**

---

## Rodar o painel localmente

```bash
cd dashboard
cp .env.example .env.local   # preencha com suas chaves
npm install
npm run dev                  # http://localhost:3000
```

As variáveis de ambiente estão documentadas em [`.env.example`](.env.example) (raiz, para os
scripts) e [`dashboard/.env.example`](dashboard/.env.example) (painel). **Nenhum segredo é
versionado** — preencha os seus localmente.

## Re-importar a planilha
```bash
python import/importar_planilha.py --dry-run   # só analisa
python import/importar_planilha.py             # grava (idempotente por processo)
```

## Recriar/atualizar os workflows n8n
```bash
python n8n/criar_workflows.py
```

---

## Limites de negócio (configuráveis no painel)
- Envio só das **8h às 20h** (America/Sao_Paulo); intervalo mínimo **12s**.
- Aquecimento: **30 → 100 → 250 → 400 → 500** novos contatos/chip/dia ao longo de 30 dias.
- Desconto por idade da dívida: 15+ anos → 60%, 10+ → 50%, 5+ → 40%, abaixo → 30%.
- Comissão padrão: **10%** (split Asaas).
