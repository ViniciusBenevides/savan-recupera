# Contexto do Projeto — SAVAN Recupera

> Documento para retomar o contexto em novas sessões com Claude.
> Última atualização: build completo + dashboard no ar + criação de usuários.

---

## 1. O que é

Plataforma de **recuperação extrajudicial de crédito por WhatsApp** para a carteira de um
**varejista de calçados** (cliente anonimizado · ~50 mil devedores · carteira na casa dos R$ 10 mi).
O bot oferece **quitação voluntária com desconto**, gera **Pix com split automático
90% SAVAN / 10% operador** (Asaas) e tudo é operável por um **painel web** — o software
será vendido ao "Maurélio" (dono da carteira, não-técnico), então **zero necessidade de
mexer em n8n/código**.

### Regras de negócio inegociáveis (jurídico)
Dívidas com média de **15,8 anos → ~99,8% prescritas** e **fora do Serasa** (>5 anos).
- Bot **nunca** ameaça ação judicial, **nunca** menciona Serasa/SPC/negativação/score.
- Enquadramento sempre: "quitação voluntária / encerramento definitivo com termo de quitação".
- Se perguntarem sobre prescrição → responder **honestamente** (dívida antiga, pode estar
  prescrita, pagamento voluntário).
- **Confirmação de identidade obrigatória** antes de revelar CPF/valor (telefone de 15 anos
  = alto risco de número reciclado → maior risco LGPD).
- Envio **8h–20h** America/Sao_Paulo, intervalo mín. **12s**, aquecimento
  **30→100→250→400→500** novos contatos/chip/dia em 30 dias.
- Descontos por idade: 15+ anos→60%, 10+→50%, 5+→40%, <5→30%. Margem extra única: +10pp.
- Comissão **10%** via split Asaas. **Bloqueante legal:** contrato de cobrança + DPA (LGPD)
  assinados com a SAVAN antes de qualquer disparo real.

---

## 2. Stack técnica

| Camada | Tecnologia | Detalhe |
|---|---|---|
| Banco | **Supabase Postgres 17** | projeto `<SUPABASE_PROJECT_REF>` (us-east-2) |
| Cérebro/lógica | **Supabase Edge Functions** (Deno/TS) | 9 funções — fazem o trabalho pesado |
| Orquestração | **n8n** (Coolify) | `https://<seu-n8n>` — 5 workflows finos |
| Atendimento | **Chatwoot** (fork fazer.ai, Coolify) | `https://<seu-chatwoot>` conta 1, canal `zapi` |
| WhatsApp | **Z-API** + chips **Salvy** | ainda NÃO comprados — cadastro pré-pronto no painel |
| Pagamentos | **Asaas** | sandbox hoje; Pix + split |
| Frontend | **Next.js 15.5.19** (App Router) + **React 18** + **Tailwind v3** | deploy Vercel |
| Auth | **Supabase Auth** (`@supabase/ssr`) | e-mail/senha + middleware |
| Gráficos | **Recharts** · ícones **lucide-react** | |
| Fontes | Bricolage Grotesque (display) · Plus Jakarta Sans (corpo) · JetBrains Mono (números) | |

**Decisão de arquitetura central:** o trabalho pesado (negociação, seleção de lote, Pix,
webhook) fica nas **Edge Functions** (testáveis via curl, sempre no ar), não em nós n8n
complexos. Os workflows n8n são finos: só orquestram timing e I/O com Chatwoot/Z-API.

---

## 3. Estrutura de pastas

```
MaurelioV2/
├── README.md                      # guia de operação + checklist go-live
├── contexto-projeto.md            # este arquivo
├── conversa_com_claude.md         # histórico das decisões (planejamento)
├── dividas_savan.xlsx             # planilha-fonte (sheet "ControlDesk", A1:AH50578)
├── .env                           # TODAS as credenciais (Supabase, Chatwoot, Asaas, Z-API, n8n key)
│
├── supabase/
│   ├── migrations/                # 7 migrations (rodadas via MCP apply_migration)
│   │   ├── 001_extensoes_enums_tabelas.sql
│   │   ├── 002_funcoes_triggers_views.sql
│   │   ├── 003_rls_realtime_seeds.sql
│   │   ├── 004_hardening_advisors.sql
│   │   ├── 005_rpcs_auxiliares_grants.sql
│   │   ├── 006_incrementos_metricas.sql
│   │   └── 007_tabela_segredos.sql
│   └── functions/                 # Edge Functions (deployadas via MCP deploy_edge_function)
│       ├── _shared/lib.ts         # utilitários (versão de referência; deployadas são self-contained)
│       ├── _shared/asaas.ts
│       ├── campanha-lote/index.ts
│       ├── campanha-registrar/index.ts
│       ├── contato-criar/index.ts
│       ├── bot-turno/index.ts
│       ├── gerar-pix/index.ts
│       └── webhook-asaas/index.ts
│       # (campanha-followup, chips-monitor, metricas-sync deployadas direto via MCP)
│
├── import/
│   └── importar_planilha.py       # parse xlsx → normaliza → grava no Supabase (idempotente)
│
├── n8n/
│   └── criar_workflows.py         # cria/atualiza os 5 workflows via API n8n
│
└── dashboard/                     # Next.js (deploy Vercel)
    ├── .env.local                 # vars locais (mesmas estão na Vercel)
    ├── tailwind.config.ts         # design system dark fintech
    └── src/
        ├── middleware.ts          # proteção de rotas (auth)
        ├── lib/
        │   ├── supabase-browser.ts
        │   ├── supabase-server.ts # supabaseServer() + supabaseAdmin() (service role)
        │   └── utils.ts           # brl(), num(), pct(), datas, cn()
        ├── components/
        │   ├── Brand.tsx · Sidebar.tsx · StatCard.tsx
        │   ├── charts.tsx (RecuperacaoChart, Funil) · RealtimeFeed.tsx
        │   └── ui/primitives.tsx  (Card, Button, Badge, Input, Switch, etc.)
        └── app/
            ├── login/page.tsx
            ├── (dash)/            # layout protegido com sidebar
            │   ├── layout.tsx · page.tsx (visão geral)
            │   ├── campanha/ (page + controls.tsx)
            │   ├── chips/ (page + chip-card.tsx + novo/page+flow.tsx)
            │   ├── templates/ (page + manager.tsx)
            │   ├── descontos/ (page + editor.tsx)
            │   ├── devedores/ (page + [id]/page.tsx)
            │   ├── pagamentos/ · relatorios/
            │   ├── configuracoes/ (page + form.tsx)
            │   └── conta/ (page + form.tsx)   # minha conta: nome, e-mail, senha
            └── api/
                ├── config/route.ts            # atualiza configuracoes (admin/operador)
                ├── segredos/route.ts          # GET status + POST (admin)
                ├── usuarios/route.ts          # muda role + travas anti auto-bloqueio
                ├── usuarios/criar/route.ts    # cria usuário (admin)
                ├── conta/route.ts             # nome + e-mail próprios
                └── chips/route.ts + [id]/qrcode + [id]/acao
```

---

## 4. Banco de dados (Supabase)

**Tabelas principais:** `devedores`, `telefones_devedor`, `fila_envios`, `conversas`,
`mensagens`, `negociacoes`, `pagamentos`, `chips`, `chips_credenciais`,
`chip_metricas_diarias`, `configuracoes`, `templates_mensagem`, `usuarios_app`,
`segredos`, `eventos_campanha`, `metricas_diarias`, `bot_fila_mensagens`, `bot_locks`.

**Estado atual dos dados:** ~50 mil devedores · ~215 mil telefones · ~47 mil na fila
(`status='na_fila'`/`aguardando`) · ~3 mil sem WhatsApp · soma na casa dos R$ 10 mi. *(valores exatos omitidos)*

**Funções/RPCs:** `fn_proposta(devedor)` (calcula desconto — o LLM NUNCA faz aritmética),
`fn_selecionar_lote(chip,n)` (FOR UPDATE SKIP LOCKED), `fn_limite_chip`, `fn_proposta`,
`fn_estado_campanha`, `fn_proximo_telefone`, `fn_resetar_presos`, `fn_inc_chip_metrica`,
`fn_inc_metrica_dia`, `fn_role`. View `v_funil`.

**Triggers:** `trg_pagamento_confirmado` (pago → propaga p/ devedor/conversa/métrica),
`trg_usuario_novo` (cria `usuarios_app` como visualizador no signup), touch de `atualizado_em`.

**RLS:** SELECT p/ authenticated em quase tudo; escrita admin/operador; `segredos`,
`chips_credenciais`, `bot_*` sem policy (só service_role). Realtime em pagamentos, chips,
metricas_diarias, eventos_campanha.

**Segredos** (tabela `segredos`, lida só pelo service_role):
`CHATWOOT_TOKEN`, `ASAAS_API_KEY_SANDBOX` (preenchida), `ASAAS_API_KEY_PROD` (vazia),
`ASAAS_WEBHOOK_TOKEN`, `OPENAI_API_KEY` (**vazia** — bot não responde sem ela),
`ZAPI_CLIENT_TOKEN`. ⚠️ Runtime do Supabase **bloqueia `Deno.env.set`** → cada Edge
Function lê os segredos via função que **RETORNA um mapa** (não seta env).

---

## 5. Edge Functions (9, todas ACTIVE)

| Função | verify_jwt | Papel |
|---|---|---|
| `campanha-lote` | true | gates (campanha/janela/aquecimento) → seleciona lote → renderiza msg (spintax) |
| `campanha-registrar` | true | grava resultado do envio, cria conversa, métricas, tenta próximo telefone |
| `contato-criar` | true | on_whatsapp + busca/cria contato e conversa no Chatwoot (fallback 9º dígito) |
| `bot-turno` | true | **cérebro do bot** — OpenAI function calling (tools: consultar_divida, gerar_pix, escalar_humano, nao_perturbe, pessoa_errada, desconto_extra) |
| `gerar-pix` | true | cria customer + Pix Asaas com **split 90/10**, grava negociação/pagamento |
| `webhook-asaas` | **false** | recebe pagamento (autentica por header `asaas-access-token`); SEMPRE 200; envia confirmação + termo de quitação |
| `campanha-followup` | true | reengaja sem-resposta até 3×, respeita janela |
| `chips-monitor` | true | consulta status Z-API de cada chip, atualiza saúde/status |
| `metricas-sync` | true | reabre presos, recalcula métricas do dia, promove chips aquecidos→ativos |

---

## 6. n8n (5 workflows ativos)

`SAVAN W01 Disparador` (1 min) · `W02 Bot Negociador` (webhook `/webhook/savan-bot`) ·
`W07 Follow-up` (5 min) · `W08 Monitor de Chips` (15 min) · `W09 Métricas` (5 min).
Recriáveis com `python n8n/criar_workflows.py`. API key salva no `.env` como `n8n api key`.
Chamam as Edge Functions por HTTP com o service_role como Bearer.

Webhook do **Chatwoot id 5** → `https://<seu-n8n>/webhook/savan-bot`
(evento `message_created`).

---

## 7. Chatwoot

Conta 1. Canal `Channel::Whatsapp` provider **`zapi`**, `provider_config = {token,
instance_id, client_token}` (client_token = `ZAPI_CLIENT_TOKEN`). Labels: `agente-off`,
`escalado-humano`, `pix-enviado`, `pix-pago`, `acordo`, `sem-whatsapp`, `nao-perturbe`,
`pessoa-errada`, `contestou-divida`, `gestor`. Atributos de contato: `devedor_id`,
`processo`, `valor_divida`, `desconto_oferecido`, `asaas_id_cliente`, `asaas_id_cobranca`,
`asaas_status_cobranca`. Time "Cobranca SAVAN". Humano assume direto no Chatwoot.

---

## 8. Dashboard (Vercel)

**URL pública:** domínio canônico `*.vercel.app` (as URLs `-hash-.vercel.app` têm SSO da
Vercel e retornam 401; usar o canônico).
**Login admin:** `<ADMIN_EMAIL>` · senha inicial `<ADMIN_SENHA>` *(credenciais omitidas — ver gestor de segredos)*.
Projeto Vercel: `<team>/savan-recupera` (7 env vars de produção).

**Páginas:** Visão geral (cards + funil + feed realtime de pagamentos) · Campanha (switch
gigante liga/desliga, modo simulação, janela, intervalo, aquecimento) · Chips (cards +
cadastro com QR via proxy) · Mensagens (CRUD templates + preview) · Descontos (editor de
faixas + simulador) · Devedores (busca + detalhe/timeline) · Pagamentos · Relatórios ·
Configurações (Asaas, segredos, **criar/gerir usuários**) · Minha conta (nome, e-mail, senha).

**Papéis:** admin (tudo) · operador (campanha/chips/templates) · visualizador (leitura).

---

## 9. Problemas resolvidos nesta sessão (arquivos)

1. **`Deno.env.set` bloqueado no Supabase** → segredos não chegavam às Edge Functions.
   Solução: `carregarSegredos()` passou a **retornar um mapa** lido do banco; funções
   self-contained. (afetou: webhook-asaas, contato-criar, gerar-pix, bot-turno, chips-monitor,
   campanha-followup + `supabase/functions/_shared/lib.ts`).
2. **Vercel bloqueava deploy** ("Vulnerable version of Next.js"). Solução: fixar
   **`next@15.5.19`** (era 15.0.3). (`dashboard/package.json`).
3. **Conflito React RC × recharts** no `npm install`. Solução: **React 18.3.1** estável
   (em vez do RC). (`dashboard/package.json`).
4. **Sem tela de trocar senha** (o README mandava trocar, mas não havia onde). Solução:
   página **Minha conta** + rota `api/conta`. (`app/(dash)/conta/*`, `api/conta/route.ts`,
   `Sidebar.tsx` — card do usuário virou link).
5. **Usuário rebaixou a própria conta de admin sem querer**. Solução: travas em
   `api/usuarios/route.ts` (não rebaixa a si mesmo; não remove o último admin). Correção
   pontual feita via SQL (voltou a admin).
6. **Não dava para trocar e-mail de login**. Solução: troca instantânea via service role
   (`api/conta/route.ts` com `admin.auth.admin.updateUserById`, `email_confirm:true`) +
   campo no formulário. (escolha: instantâneo porque o SMTP de confirmação não está
   configurado neste Supabase).
7. **Não dava para criar usuários** (login sem signup; Usuários só trocava papel). Solução:
   `api/usuarios/criar/route.ts` (admin cria com e-mail/senha/papel, e-mail já confirmado)
   + formulário em `configuracoes/form.tsx`.
8. **Telefones múltiplos por célula + 9º dígito + datas mistas** na planilha. Solução:
   `import/importar_planilha.py` (explode FONE MÓVEL por vírgula, normaliza E.164, insere
   9º dígito em celular de 8 dígitos, datas serial/string, CPF re-pad 11).
9. **Hardening de segurança** (advisors do Supabase): search_path fixo, pg_trgm fora do
   public, revoke execute das funções internas. (`004_hardening_advisors.sql`).

---

## 10. Pendências / Go-Live (detalhe no README.md)

Tudo pré-pronto. Faltam itens que dependem de compra/assinatura:
1. **Chaves** no painel (Configurações → Chaves): `OPENAI_API_KEY` (bot não responde sem),
   `ASAAS_API_KEY_PROD`.
2. **Asaas produção:** walletId da SAVAN + ligar ambiente produção + apontar webhook para
   `…/functions/v1/webhook-asaas` (header `asaas-access-token`).
3. **Chips:** comprar 5 Salvy + 5 instâncias Z-API → cadastrar no painel (QR) → ativar.
4. **Jurídico (bloqueante):** contrato de cobrança + DPA (LGPD).
5. **Segurança:** rotacionar a `service_role` do Supabase antes de entregar ao Maurélio
   (atualizar em Vercel, segredos do Supabase e `.env`).
6. Testar com **Modo simulação** ligado antes do disparo real.

---

## 11. Como testar/rodar

```bash
# Dashboard local
cd dashboard && npm install && npm run dev   # localhost:3000

# Re-import da planilha (idempotente por processo)
python import/importar_planilha.py --dry-run   # só analisa
python import/importar_planilha.py             # grava

# Recriar workflows n8n
python n8n/criar_workflows.py

# Deploy do dashboard
cd dashboard && npx vercel --prod --yes
```

**Teste E2E sem chips** (validado nesta sessão): inserir chip fake `aquecendo` +
`campanha_ativa=true` + `modo_simulacao=true` → chamar `campanha-lote` → retorna itens com
mensagem renderizada → limpar cenário. (A fila volta ao total inicial, campanha desligada.)

---

## 12. Credenciais — onde estão

Todas no `.env` da raiz: Supabase (URL, anon, service_role), Chatwoot (URL, token),
Asaas (chave sandbox, webhook token), Z-API (client token), n8n (login, senha, api key).
No dashboard: `dashboard/.env.local` (local) e 7 env vars na Vercel (produção).
Segredos operacionais das Edge Functions: tabela `segredos` no Supabase.
```
```
