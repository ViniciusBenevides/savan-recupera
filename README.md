# Recupera

> **Real-world portfolio case — client anonymized.** Names, credentials, project
> identifiers and exact portfolio figures have been removed or generalized.
> The product is **white-label**: the brand shown in the UI is configurable via
> `NEXT_PUBLIC_APP_NAME` (defaults to "Recupera").

A **WhatsApp-based out-of-court debt recovery** platform for the portfolio of a
**footwear retailer** (~50k debtors · portfolio in the ~R$10M range). The bot offers
**voluntary settlement with a discount**, generates Pix payments with an **automatic
90% creditor / 10% operator split**, and everything is operated through a **web dashboard** —
no code required.

> ⚠️ **Before any real outreach:** the debts average ~15 years old and are legally
> time-barred (prescribed). The bot **never** threatens, **never** mentions credit-bureau
> negative listing, and answers honestly about prescription. A debt-collection service
> agreement + a Data Processing Agreement (LGPD, Brazil's GDPR) signed with the creditor is
> **mandatory** before switching the campaign on in production.

---

## Architecture

| Layer | Technology | What it does |
|---|---|---|
| **Database** | Supabase Postgres | Full schema in `supabase/migrations/`. ~50k debtors, ~215k phone numbers. |
| **Brain** | Supabase Edge Functions `supabase/functions/` | 9 functions: `campanha-lote`, `campanha-registrar`, `contato-criar`, `bot-turno`, `gerar-pix`, `webhook-asaas`, `campanha-followup`, `chips-monitor`, `metricas-sync`. |
| **Orchestration** | n8n | 5 thin workflows: `W01 Dispatcher`, `W02 Negotiator Bot`, `W07 Follow-up`, `W08 Number/Chip Monitor`, `W09 Metrics`. |
| **Support inbox** | Chatwoot (fazer.ai fork) | Per-number inboxes, labels, attributes, webhook → W02. Humans take over directly here. |
| **Payments** | Asaas | Pix with split. Webhook → `webhook-asaas` Edge Function. |
| **Dashboard** | Next.js 15 on Vercel | Operated by a non-technical user. |
| **Import** | `import/importar_planilha.py` | Reads the source spreadsheet, normalizes it and populates the database. |

**Core architectural decision:** the heavy lifting (negotiation, batch selection, Pix,
webhooks) lives in the **Edge Functions** (curl-testable, always on), not in complex n8n
nodes. The n8n workflows are thin: they only orchestrate timing and I/O with Chatwoot/Z-API.

---

## How it works (flow)

1. **W01 Dispatcher** (n8n, every 1 min) calls `campanha-lote`, which applies the rules
   (campaign on? inside the allowed time window? chip warm-up limit?), selects a batch from
   the queue and returns the ready-to-send messages. n8n creates the contact/conversation in
   Chatwoot (`contato-criar`), sends, records the result (`campanha-registrar`) and waits 12s.
2. The debtor replies → Chatwoot fires the **webhook → W02 Negotiator Bot** → `bot-turno`
   (OpenAI) confirms identity, presents the offer, generates the Pix (`gerar-pix`) and answers.
3. The debtor pays → Asaas calls `webhook-asaas` → status becomes "paid", the split settles
   (90/10), and the debtor receives a **confirmation + settlement receipt**.
4. No reply? **W07 Follow-up** re-engages up to 3× and then closes out.
5. **W08** monitors the WhatsApp connection of each number; **W09** consolidates the metrics.

Everything the operator needs to touch (turn the campaign on, discounts, message templates,
numbers) lives in the dashboard. **n8n runs on its own.**

---

## Run the dashboard locally

```bash
cd dashboard
cp .env.example .env.local   # fill in with your own keys
npm install
npm run dev                  # http://localhost:3000
```

Environment variables are documented in [`.env.example`](.env.example) (root, for the
scripts) and [`dashboard/.env.example`](dashboard/.env.example) (dashboard). **No secrets are
committed** — fill in your own locally.

**White-label brand:** set `NEXT_PUBLIC_APP_NAME` to rebrand the whole UI per client
(logo wordmark + page title). One or two words; the second word is highlighted. No client
name is hardcoded anywhere in the screens.

## Re-import the spreadsheet
```bash
python import/importar_planilha.py --dry-run   # analyze only
python import/importar_planilha.py             # write (idempotent per case)
```

## Recreate/update the n8n workflows
```bash
python n8n/criar_workflows.py
```

---

## Business limits (configurable in the dashboard)
- Outreach only between **8am and 8pm** (America/Sao_Paulo); minimum **12s** interval.
- Warm-up ramp: **30 → 100 → 250 → 400 → 500** new contacts/number/day over 30 days.
- Discount by debt age: 15+ years → 60%, 10+ → 50%, 5+ → 40%, below → 30%.
- Default commission: **10%** (Asaas split).
