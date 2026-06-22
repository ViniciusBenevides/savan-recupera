# Contexto do Projeto — SAVAN Recupera

> Documento para retomar o contexto em novas sessões com Claude.
> Última atualização: **Segmentação de tipo de chip (físico/eSIM/VoIP/virtual só-API, informativo
> com alertas) + múltiplos números de teste com escolha do alvo no disparo — ver §18.**
> (Anteriores: modo teste de verdade + papel de chip §17, distribuição/maturidade/failover §16,
> Central de Ajuda §15, conexão de chips ponta a ponta Z-API ↔ Chatwoot §9.12, tema claro/escuro §8,
> white-label `NEXT_PUBLIC_APP_NAME`, GitHub público + deploy Vercel §13.)

---

## 1. O que é

Plataforma de **recuperação extrajudicial de crédito por WhatsApp**, agora um **produto
multi-carteira vendável**: o cliente sobe **planilhas pelo próprio painel** (cada uma vira uma
**carteira** independente), tem **controle total** (quem foi contatado, quem respondeu, como) e
**configura o robô** (prompt/regras/descontos) sem tocar em n8n/código. O bot oferece
**quitação voluntária com desconto**, gera **Pix com split automático 90% credor / 10%
operador** (Asaas). Vendido ao **cliente final** não-técnico (ex.: Maurélio) — **uma instância
por cliente**, com várias carteiras dentro. Ver a reformulação multi-carteira no **§14**.

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
  assinados com o credor antes de qualquer disparo real.

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
MaurelioV2/                        # repo Git público (ver §13). [gi] = gitignored, fora do repo
├── README.md                      # apresentação do projeto (em inglês)
├── contexto-projeto.md            # este arquivo
├── .gitignore                     # exclui segredos, PII e bloat do repo
├── .env.example                   # template das vars dos scripts (formato "chave: valor")
├── conversa_com_claude.md         # [gi] histórico das decisões (planejamento)
├── dividas_savan.xlsx             # [gi] planilha-fonte REAL (PII LGPD) — NUNCA versionar
├── .env                           # [gi] TODAS as credenciais (Supabase, Chatwoot, Asaas, Z-API, n8n)
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
│       ├── webhook-asaas/index.ts
│       ├── campanha-followup/index.ts
│       ├── chips-monitor/index.ts     # self-contained (= deployada); trazida ao repo na §15
│       └── metricas-sync/index.ts     # self-contained (= deployada); trazida ao repo na §15
│       # as 9 funções estão no repo (chips-monitor/metricas-sync são self-contained)
│
├── import/
│   └── importar_planilha.py       # parse xlsx → normaliza → grava no Supabase (idempotente)
│
├── n8n/
│   ├── criar_workflows.py         # cria/atualiza os 5 workflows via API n8n (+ aplica tag SAVAN)
│   ├── organizar_tags.py          # (re)aplica a tag SAVAN nos workflows do produto
│   └── README.md                  # catálogo dos workflows, review n8n✕código, pasta vs. tag (§15)
│
├── docs/
│   └── manual-do-usuario.md       # manual do operador (fonte em prosa da Central de Ajuda /ajuda)
│
└── dashboard/                     # Next.js (deploy Vercel via Git — ver §13)
    ├── .env.local                 # [gi] vars locais (mesmas estão na Vercel)
    ├── .env.example               # template das vars (formato KEY=valor)
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
            │   ├── conta/ (page + form.tsx)   # minha conta: nome, e-mail, senha
            │   └── ajuda/page.tsx             # Central de Ajuda (manual interativo no painel, §15)
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

**Estado atual dos dados:** banco **zerado** (a base suja antiga da SAVAN foi apagada — ver
§14). Devedores/telefones/fila começam vazios e são populados pelos uploads de planilha do
painel. Cada devedor pertence a uma **carteira** (`devedores.carteira_id`).

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
Chamam as Edge Functions por HTTP com o service_role como Bearer. **Organização (tag `SAVAN`),
review n8n✕código e o ramo de escalada do W02: ver §15 e `n8n/README.md`.**

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
**Deploy:** integração Git da Vercel — `git push` na `main` → deploy automático
(**Root Directory = `dashboard`**). Detalhes no §13.
**Branding (white-label):** nenhum nome de credor aparece nas telas. O nome do produto vem
de `NEXT_PUBLIC_APP_NAME` (padrão **"Recupera"**), usado em `components/Brand.tsx` (logo —
2 palavras → 2ª em verde), `app/layout.tsx` (título da aba) e no nome do inbox criado em
`api/chips/route.ts`. Para rebrandizar por cliente, basta setar a env (sem mexer no código).
`wallet_savan`/`repasse_savan` continuam só como identificadores internos de banco.

**Tema (claro/escuro):** sistema baseado em **CSS variables** (canais RGB) — os tokens do
Tailwind (`ink-*`, `line`, `mist`, `chalk`, `emerald`/`violet`/`amber`/`rose`/`blue`) resolvem
para `rgb(var(--c-*) / <alpha-value>)`. `globals.css` define dois conjuntos: `:root` (escuro,
padrão) e `html.light` (claro). Trocar de tema = só adicionar/remover a classe `light` no
`<html>` — **nenhuma tela precisa ser reescrita**. `components/ThemeToggle.tsx` faz o toggle
(persistido em `localStorage`, chave `theme`) e exporta o hook `useTheme()`; um script
anti-flash em `app/layout.tsx` aplica o tema antes da pintura. Os gráficos (`charts.tsx`,
recharts) leem `useTheme()` para colorir grade/eixos/tooltip. Texto sobre o verde (botão
primário, letra do logo) usa cor fixa escura (`#04140c`) para não sumir no modo claro. Toggle
disponível na **sidebar** (rodapé) e no **login** (canto sup. direito). Padrão = escuro.

**Páginas:** Visão geral (cards + funil + feed realtime de pagamentos) · Campanha (switch
gigante liga/desliga, modo simulação, janela, intervalo, aquecimento) · Chips (cards +
cadastro com QR via proxy) · Mensagens (CRUD templates + preview) · Descontos (editor de
faixas + simulador) · Devedores (busca + detalhe/timeline) · Pagamentos · Relatórios ·
Configurações (Asaas, segredos, **criar/gerir usuários**) · Minha conta (nome, e-mail, senha) ·
**Ajuda** (manual de uso interativo no painel, `/ajuda` — ver §15).

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
10. **Branding entregava o credor nas telas (white-label).** O logo dizia "SAVAN Recupera".
    Solução: nome do produto via `NEXT_PUBLIC_APP_NAME` (padrão "Recupera") em
    `components/Brand.tsx`, `app/layout.tsx` e `api/chips/route.ts`; var em ambos `.env.example`.
    Nenhum nome de credor hardcoded na UI. (Templates do bot no banco ainda citam o credor ao
    devedor — isso é legítimo e por carteira, não é branding do produto.)
11. **Só havia modo escuro; faltava tema claro + toggle.** Solução: cores migradas para CSS
    variables (Tailwind `rgb(var(--c-*) / <alpha-value>)`), dois temas em `globals.css`
    (`:root` escuro + `html.light` claro), `ThemeToggle`/`useTheme` com persistência e script
    anti-flash, gráficos theme-aware, fix de texto on-accent. Detalhe na seção "Tema" do §8.
12. **Conexão de chips quebrada de ponta a ponta (Z-API ↔ Chatwoot).** Sintomas: o QR não
    aparecia quando a assinatura da instância Z-API estava expirada/pendente/cancelada (só um
    spinner infinito, sem explicação); o inbox do Chatwoot era criado com telefone-placeholder
    e o webhook do canal (derivado do número) ficava errado → **mensagens recebidas não
    roteavam**; e o Token de Segurança era um env global (errado para um produto multi-conta
    Z-API). Solução:
    - **Proxy do QR** (`api/chips/[id]/qrcode`) classifica o erro da Z-API
      (`assinatura`/`config`/`credencial`/`indisponivel`) e a tela mostra um **card** explicando
      (ex.: "quite a assinatura desta instância, não pode estar cancelada"), com link para
      app.z-api.io e botão "já paguei, tentar de novo"; o polling pausa em erro definitivo.
    - **Finalização automática ao conectar** (`lib/zapi.ts` `finalizarConexaoChip`): lê o número
      real em `/device` (o `/status` **não** traz o telefone), corrige o `phone_number` do inbox
      no Chatwoot (PATCH; se não aplicar, deleta e recria) e aponta os webhooks da Z-API para
      `…/webhooks/whatsapp/+<numero>` (`update-every-webhooks`, fallback `update-webhook-received`).
      Roda uma vez (guard) e não rebaixa quem já está aquecendo/ativo/pausado.
    - **Token de Segurança por chip** (migration `009_chip_client_token.sql`: coluna
      `chips_credenciais.zapi_client_token`): informado no cadastro e na edição (cada conta Z-API
      tem o seu); o env `ZAPI_CLIENT_TOKEN` virou apenas **fallback** para chips antigos.
    - **Chatwoot sempre linkado** (`lib/chatwoot.ts`): a criação do inbox deixou de ser muda
      (retorna status), há rota de revínculo (`api/chips/[id]/chatwoot`), telefone-placeholder
      **único por chip** (evita colisão de número no 2º chip) e aviso "Chatwoot não vinculado"
      no card da lista.
    - **Editar/excluir chip** (`api/chips/[id]` GET/PATCH/DELETE): o menu ⋮ do card abre a edição
      já preenchida, com os tokens **ocultos** (campo senha + olho para revelar); salva só o que
      mudou; excluir remove o chip (cascade nas credenciais/métricas) e o inbox no Chatwoot.
    (arquivos: `dashboard/src/lib/{chatwoot,zapi}.ts`, `app/api/chips/route.ts` + `[id]/{route,
    qrcode,chatwoot}.ts`, `app/(dash)/chips/{chip-card.tsx,novo/flow.tsx}`,
    `supabase/migrations/009_chip_client_token.sql`.)

---

## 10. Pendências / Go-Live (detalhe no README.md)

Tudo pré-pronto. Faltam itens que dependem de compra/assinatura:
1. **Chaves** no painel (Configurações → Chaves): `OPENAI_API_KEY` (bot não responde sem),
   `ASAAS_API_KEY_PROD`.
2. **Asaas produção:** walletId da SAVAN + ligar ambiente produção + apontar webhook para
   `…/functions/v1/webhook-asaas` (header `asaas-access-token`).
3. **Chips:** comprar 5 Salvy + 5 instâncias Z-API → cadastrar no painel (QR) → ativar.
4. **Jurídico (bloqueante):** contrato de cobrança + DPA (LGPD).
5. **Segurança:** rotacionar a `service_role` do Supabase antes de entregar ao cliente final
   (atualizar em Vercel, segredos do Supabase e `.env`).
6. Testar com **Modo simulação** ligado antes do disparo real.

---

## 11. Como testar/rodar

> Os scripts `import/` e `n8n/` leem URLs e chaves do `.env` da raiz (ver `.env.example`).
> Necessário ter a chave `supabase api url` no `.env` (além do `service_role supabase`, `url n8n`).

```bash
# Dashboard local
cd dashboard && cp .env.example .env.local   # preencher; npm install && npm run dev (localhost:3000)

# Re-import da planilha (idempotente por processo)
python import/importar_planilha.py --dry-run   # só analisa
python import/importar_planilha.py             # grava

# Recriar workflows n8n
python n8n/criar_workflows.py

# Deploy do dashboard → automático: basta `git push` na branch main (ver §13)
```

**Teste E2E sem chips** (validado nesta sessão): inserir chip fake `aquecendo` +
`campanha_ativa=true` + `modo_simulacao=true` → chamar `campanha-lote` → retorna itens com
mensagem renderizada → limpar cenário. (A fila volta ao total inicial, campanha desligada.)

---

## 12. Credenciais — onde estão

Todas no `.env` da raiz (**gitignored**): Supabase (`service_role supabase`, `supabase api url`),
Chatwoot (URL, token), Asaas (chave sandbox, webhook token), Z-API (client token), n8n (URL,
login, senha, api key). Template sem valores em `.env.example`.
No dashboard: `dashboard/.env.local` (**gitignored**, template em `dashboard/.env.example`) e 7
env vars na Vercel (produção). Segredos operacionais das Edge Functions: tabela `segredos` no Supabase.

---

## 13. Versionamento & Deploy (GitHub + Vercel) — adicionado nesta sessão

- **Repositório:** `github.com/ViniciusBenevides/savan-recupera` — **público**, monorepo
  (`dashboard/` + `supabase/` + `import/` + `n8n/`). Criado via `gh` CLI; branch padrão `main`.
- **Deploy:** integração Git da Vercel. `git push` na `main` → build/deploy automático em
  produção. **Root Directory = `dashboard`** (o Next fica na subpasta). `npx vercel --prod` não
  é mais necessário; as 7 env vars de produção ficam no projeto da Vercel.
- **`.gitignore`** mantém fora do repo: `.env` e `**/.env*.local`, `dividas_savan.xlsx`/`*.xlsx`
  (PII LGPD), `.next/`, `node_modules/`, `.vercel/`, `.claude/`, `Documentacao/`, `referencias/`,
  `WORKFLOWS/`, `conversa_com_claude.md`, `__pycache__/`.
- **Anonimização (repo público) — docs E código:** nome real do cliente, razão social e
  operador → genéricos ("nossa loja de calçados"/"credor"); figuras reais → arredondadas; URLs
  de infra (n8n/chatwoot) e ref do Supabase → fora do repo (Edge Functions caem em fallback
  `*.example.com`; `import/` e `n8n/` leem `url n8n` e `supabase api url` do `.env`).
  **Mantidos** (não são dado sensível): codinome **"SAVAN Recupera"**, nomes de workflow
  (`SAVAN W01`…) e identificadores de banco (`wallet_savan`, `repasse_savan`).
- **Pendência de segurança:** os segredos circularam em texto → **rotacionar a `service_role`**
  do Supabase (e atualizar Vercel + `.env`) antes de qualquer entrega (ver §10.5).

---

## 14. Reformulação multi-carteira (produto vendável) — adicionado nesta sessão

Transformação de single-client (lista fixa SAVAN, import por script Python) em **produto
multi-carteira 100% operável pelo front**. Decisões: **1 instância por cliente** (várias
carteiras dentro) · **modelo de planilha fixo** p/ baixar · **config por carteira com padrão
global** · **base suja apagada** (a planilha-fonte segue no PC do dono como backup).

**Banco — migration `008_carteiras_multicarteira.sql` (aplicada):**
- Tabela **`carteiras`** (`nome` UNIQUE, `credor`, `status` enum
  `importando|ativa|pausada|arquivada`, `num_devedores`, `soma_saldo`, e overrides
  `prompt_persona`/`contexto_negocio`/`guardrails`/`config_override` — NULL herda o global).
- Tabela **`importacoes`** (1 linha por upload; `arquivo_nome` **UNIQUE global** → bloqueia
  subir 2 planilhas com o mesmo nome; relatório `erros` jsonb).
- `carteira_id` em `devedores`/`fila_envios`/`conversas`/`eventos_campanha`.
- **Dedup por carteira:** `processo` deixou de ser único/obrigatório; identidade do devedor =
  `UNIQUE(carteira_id, cpf_cnpj)`.
- Seeds globais do robô em `configuracoes`: `bot_persona`, `bot_contexto`, `bot_guardrails`.
- `fn_proposta` usa descontos da carteira (override) com fallback global; `fn_selecionar_lote`
  só seleciona de carteiras **`ativa`**.

**Edge Functions (redeployadas, self-contained):** o **prompt do robô saiu do código** e passa
a vir do banco (`montarSystemPrompt`: persona/contexto/guardrails da carteira → global →
default). `bot-turno` resolve a carteira via conversa→devedor; `campanha-lote`/`campanha-registrar`
propagam `carteira_id` e usam o `credor` da carteira; `gerar-pix` aceita wallet/comissão por
carteira. (`campanha-followup` ainda não escopa por status de carteira — pendência menor.)
n8n inalterado.

**Front (Next.js `dashboard/`):**
- Parser TS porta o Python: `src/lib/import/{normalizar,parse-planilha,modelo}.ts` (lê `.xlsx`
  com SheetJS/`xlsx`; CPF, telefone E.164 + 9º dígito + DDDs, datas, e-mails).
- Rotas: `api/carteiras` (criar/listar), `api/carteiras/[id]` (PATCH status/overrides, DELETE),
  `api/carteiras/[id]/importar` (upload multipart → import idempotente por `(carteira_id,cpf)`),
  `api/carteiras/modelo` (baixa o `.xlsx` em branco com aba de instruções).
- Páginas: **Carteiras** (lista + item na Sidebar), **Carteiras/Nova** (assistente baixar
  modelo → upload → relatório), **Carteiras/[id]** (abas Status & envios / Prompt do robô /
  Descontos / Importações). **Devedores** ganhou filtro por carteira + coluna "Resposta".
  **Configurações** ganhou editor do **padrão global do robô** (`bot-global.tsx`).
- UX: `Tooltip`/`HelpHint` em `components/ui/primitives.tsx` (bolha de ajuda no hover) usados
  nos botões/controles das telas novas. `xlsx` adicionado ao `package.json`.

**Fluxo do usuário:** Nova carteira → baixa modelo → preenche → sobe → vê relatório (importadas/
ignoradas) → carteira fica **Pausada** → ajusta prompt/descontos → **Ativa** para enviar
(ainda respeitando a chave geral em Campanha + modo simulação).

**Verificado (SQL):** override de desconto por carteira (60%↔80%), fallback global, dedup
`(carteira_id,cpf_cnpj)`, e `fn_selecionar_lote` (pausada→0 / ativa→1). Build do front OK.

---

## 15. Central de Ajuda no painel + organização/correções n8n — adicionado nesta sessão

Embasamento: skills `frontend-design`, `n8n-skills`, `chatwoot-conversation-management`.

**Documentação no produto (não só no repo):** nova página **Ajuda** (`/ajuda`,
`app/(dash)/ajuda/page.tsx`, client component) — manual de uso **interativo** e theme-aware, no
design system do painel. Recursos: índice fixo com **scroll-spy**, **busca** ao vivo que filtra
seções, **barra de progresso** de leitura, **voltar ao topo**, acordeão "tela por tela" e fluxo
visual do go-live. Item **Ajuda** na Sidebar (`LifeBuoy`). Fonte em prosa:
`docs/manual-do-usuario.md`.

**n8n organizado e revisado** (detalhe em `n8n/README.md`):
- A **API pública do n8n não gerencia pastas** (`/folders` → 404; `/projects` → 403 por licença)
  nem move workflows entre pastas. O equivalente possível é **tag**: os 6 workflows do produto
  (`SAVAN W0x` + `Setup Chatwoot`) recebem a tag **`SAVAN`** (`n8n/organizar_tags.py`; o
  `criar_workflows.py` também já aplica). Para a pasta "Cobrador Maurelio v2": filtrar por tag e
  arrastar no app web (1×). A instância é **compartilhada** com outros clientes — **só os `SAVAN`
  são deste produto; o resto não se toca.**
- **Review n8n ✕ código:** contratos batem. Correções aplicadas:
  1. **W02 — escalada agora é visível no Chatwoot.** Ramo dedicado `Bot responder → Escalou?
     → Labels atuais (GET) → Marcar escalado (mescla a label `escalado-humano`; o POST de labels
     **substitui** o conjunto, daí o GET antes) → Nota interna (privada, com o motivo)`. Antes o
     caminho mandava `content: undefined`. (W02 atualizado e **ativo**.)
  2. **`campanha-registrar` (sem_whatsapp)** busca `devedores.carteira_id` antes de criar a linha
     de retry (evita `carteira_id` nulo). Repo + **deploy (versão 3)**. Não quebrava envio
     (`fn_selecionar_lote` usa a carteira do devedor), era só consistência.
  3. **`SAVAN W01 - Setup Chatwoot`** documentado: utilitário de **setup único** (cria labels e
     custom attributes no Chatwoot), correto ficar fora do runtime (não está no script).
  4. **`chips-monitor` e `metricas-sync` trazidas ao repo** (versão self-contained = a deployada).
     Agora `supabase/functions/` tem as **9** funções.

---

## 16. Distribuição, maturidade de chip, failover e transparência — adicionado nesta sessão

Decisões do dono: **failover automático com confirmação**; **maturidade definida pelo usuário com
sugestão transparente do sistema**; **transparência bilateral** nos casos escalados (rastro
anti-fraude). Migrations **010–016** (aplicadas via MCP no projeto `wmggqsmqvklxlqwsksjs`).

**Banco (010–016):**
- `chips`: `maturidade` (`novo|aquecido`), `aquecimento_perfil`, `regiao_uf[]`, `regiao_cidade[]`.
- `carteiras`: `estrategia_distribuicao` (`igualitario|uf|cidade|manual`).
- `fila_envios`: `chip_designado_id` (chip **planejado**; `chip_id` = quem pegou).
- Tabela **`escalacoes`** (ledger): conversa/devedor/carteira/chip, `motivo`, `contexto_snapshot`,
  `status` (`aberta|em_atendimento|fechada_acordo|fechada_sem_acordo|fechada_paga`), `assumido_por`,
  `negociacao_id`/`pagamento_id`, `valor_combinado`, `observacao`. Realtime.
- Tabela **`failover_eventos`** (`pendente|aplicado|ignorado`, `resumo` jsonb, destino). Realtime.
  Índice único parcial = 1 pendente por chip.
- Seed `aquecimento_rapido` (`250×3d → 500`) para chips aquecidos.
- **Funções:** `fn_limite_chip` (precedência override → curva da maturidade → global);
  `fn_selecionar_lote` (respeita `chip_designado_id`; pega designados + pool, sem repetição);
  `fn_distribuir_carteira(carteira, estrategia)` (round-robin igualitário / arrays de UF / cidade);
  `fn_distribuicao_dados(carteira)` (contagem por UF/cidade p/ a sugestão); `fn_failover_resumo`;
  `fn_reatribuir_chip(caido, destino)` (reabre presos, re-designa fila, move conversas; escaladas
  ficam `humano`, só apontam o novo chip). `fn_pagamento_confirmado` fecha escalação aberta → `fechada_paga`.

**Edge Functions redeployadas:** `metricas-sync` (promove aquecido no fim da curva curta);
`bot-turno` v4 (**gate `estado='humano'`** = bot não reengaja; **histórico por `devedor_id`**
cruzando conversas = número novo herda contexto; grava em `escalacoes` no `escalar_humano`);
`chips-monitor` v2 (ao cair, cria `failover_eventos` pendente em vez de só rebaixar).

**Front (Next.js):**
- `components/MaturidadeField.tsx` (seletor novo/aquecido + sugestão transparente) no cadastro
  (`chips/novo/flow.tsx`) e edição (`chips/chip-card.tsx`); API `chips` aceita maturidade/perfil/override.
- `lib/distribuicao.ts` (planos igualitário/UF/cidade + ETA via curva); rotas
  `api/carteiras/[id]/sugestao-distribuicao` e `/distribuir`; UI `carteiras/[id]/distribuicao.tsx`
  na aba **Status & envios**.
- Página **Escalações** (`app/(dash)/escalacoes/`, item na Sidebar `Headset`) — ledger realtime com
  status, histórico, desfecho e ações (assumir/fechar acordo/sem acordo); API `api/escalacoes/[id]`.
- **Banner de failover** global (`components/FailoverBanner.tsx` no `(dash)/layout.tsx`): chip caiu →
  escolhe destino → confirma; API `api/failover/[id]` chama `fn_reatribuir_chip`.
- **Ajuda** (`/ajuda`) + `docs/manual-do-usuario.md`: seções "Chip aquecido ou novo", "Distribuição
  e queda de chip" e ledger de Escalações; tooltips (`HelpHint`) nos controles novos.

**Verificado (SQL, com limpeza):** maturidade (aquecido=250/novo=30 no dia 1); distribuição UF
(SP→chip A, MG+RJ→chip B) + `fn_selecionar_lote` sem sobreposição; pagamento fecha escalação;
`fn_reatribuir_chip` (escalada permanece `humano`). Build do front OK.

**Limitação documentada:** o Chatwoot não move threads entre inboxes — a herança de contexto no
failover vem do histórico em `mensagens` (por devedor) que o `bot-turno` agora carrega, não de
mover a conversa do Chatwoot. **Distribuição geográfica depende de `devedores.uf`/`cidade` na
planilha; quem não tem região cai no pool livre.** **n8n inalterado** (a designação é interna ao
`fn_selecionar_lote`, que o W01 já chama por chip).

---

## 17. Modo teste de verdade + segurança do split + Asaas por carteira + papel de chip

Pedidos do dono (perguntas sobre dinheiro/teste): tornar o split à prova de erro, deixar o
**bot e o Asaas entenderem que a campanha está em teste**, separar real×teste no painel, e
permitir **Asaas por carteira** + **escalar para um cobrador humano** (chip da equipe).

**Migration `017_modo_teste_papel_chip.sql` (aplicada via MCP no projeto `wmggqsmqvklxlqwsksjs`):**
- Flag `simulacao boolean` em `fila_envios`/`conversas`/`mensagens`/`negociacoes`/`pagamentos` (+ índices).
- `chips.papel` (`bot|equipe`) + `chips.agente_nome` (cobrador dono do chip de equipe).
- `escalacoes`: `equipe_chip_id`, `atendente_numero`, `resumo` (transparência/roteamento).
- Config `numero_teste` (`{e164, ativo}`) — **definido na tela de Chips**.
- `fn_pagamento_confirmado` reescrita: **pagamento `simulacao=true` NÃO entra em `metricas_diarias`**
  (números reais nunca contam teste); evento de pagamento carrega `simulacao` no payload.

**Edge Functions (deployadas, self-contained):**
- `gerar-pix` (v4): **trava de segurança** — em produção SEM `wallet` do credor, recusa (`wallet_credor_ausente`)
  em vez de mandar 100% pro operador. **Modo teste**: nunca toca produção; com chave sandbox cria Pix
  sandbox, sem chave gera **copia-e-cola fake** ("PIX DE TESTE — NÃO PAGUE"); grava `negociacoes`/`pagamentos`
  com `simulacao`. Lê wallet/comissão por carteira (`config_override.asaas.wallet`/`comissao_pct`) → global.
- `bot-turno` (v5): herda `conversas.simulacao` → não suja métricas, passa `simulacao` ao `gerar-pix`,
  carimba mensagens. **Escalação**: lê o cobrador da carteira (`config_override.equipe = {nome, numero, chip_id}`),
  grava `resumo`/`atendente_numero`/`equipe_chip_id` em `escalacoes` e instrui o bot a se despedir
  passando o WhatsApp do cobrador (fallback: avisa transferência sem número).
- `campanha-registrar` (v4): carimba `simulacao` em fila/conversa; teste **não consome aquecimento do chip
  nem entra em `enviados`/`falhas`**.
- `disparar-teste` (v1, **nova**): manda a 1ª mensagem ao número de teste por um chip escolhido e cria a
  conversa `simulacao=true` (carteira/devedor/telefone de teste find-or-create). É o que faz a conversa
  "avançar" (você responde no seu zap) sem incomodar devedores reais. Reusa `contato-criar`.

**Front (Next.js — vai pra produção no próximo `git push`):**
- **Chips**: card "Número de teste" (salva `numero_teste`) + botão "Enviar teste" (rota `api/chips/teste`
  → `disparar-teste`); seletor de **papel** (bot/equipe) + nome do cobrador na edição do chip + selo "Equipe".
- **Carteira**: nova aba **"Asaas & cobrador"** (`painel.tsx` `AbaAsaas`) — wallet+comissão por carteira
  (com aviso se vazio) e o cobrador humano (chip de equipe + nome + número). Patch em `config_override`.
- **Pagamentos**: totais reais excluem teste; badge **"Teste"** nas linhas `simulacao`.
- **Escalações**: mostra o **resumo p/ o atendente** e o **número do cobrador**.

**Como testar com segurança:** modo simulação ligado (Campanha) + Asaas em sandbox → Chips: defina seu
número de teste → "Enviar teste" → responda no seu WhatsApp. Bot negocia e gera Pix sandbox/fake; nada
real sai nem move dinheiro; tudo marcado "Teste".

**Escalação "os dois" (concluída):** `bot-turno` v6 faz tudo na escalação — (a) o bot avisa o devedor e
passa o WhatsApp do cobrador; (b) **avisa o cobrador no WhatsApp** (Z-API send-text pelo chip do bot, com
o resumo); (c) no Chatwoot: **nota interna com o resumo + label `escalado-humano` + atribuição ao time**
(`cfg.chatwoot.team_escalacao`, padrão "Cobranca SAVAN"). Tudo guardado por `!simulacao` (teste não dispara
avisos reais). O ramo de escalada do **n8n W02 foi removido** (centralizado no bot-turno; evita nota/label
duplicados) — `python n8n/criar_workflows.py` re-rodado, os 5 workflows atualizados.

**Verificado:** `npm run build` do front OK (14 páginas, rota `api/chips/teste` incluída); migration e os
5 deploys (gerar-pix v4, bot-turno v6, campanha-registrar v4, disparar-teste v1) retornaram sucesso; n8n
re-aplicado.

**Pendências menores (documentadas, não bloqueiam):** os arquivos de referência de `bot-turno`/
`campanha-registrar` em `supabase/functions/` seguem em estilo "reference"; **as deployadas (self-contained)
são a fonte da verdade** e carregam a lógica de teste/escalação — `gerar-pix` e `disparar-teste` já estão no repo.

---

## 18. Tipo de chip (segmentação) + múltiplos números de teste

Pedidos do dono: **segmentar o tipo de número de cada chip** e poder **cadastrar mais de um número de
teste** (escolhendo qual recebe o disparo na hora). Decisões: tipo de chip é **informativo + alertas**
(não muda o disparo); disparo de teste **escolhe o número alvo na hora**.

**Migration `018_tipo_chip_multi_teste.sql`:**
- `chips.tipo` (`fisico|esim|voip|virtual_api`, default `fisico`) — campo informativo.
- `configuracoes.numero_teste` migrado de `{e164, ativo}` para **`{numeros: [{e164, label, ativo}]}`**
  (idempotente: só converte se ainda não tiver a chave `numeros`; o app lê os dois formatos).

**Tipo de chip — segmentação (informativa, com alerta de risco/conexão):**
- **`fisico`** SIM tradicional · **`esim`** chip de operadora digital — ambos conectam normal pelo QR,
  menor risco de bloqueio.
- **`voip`** número VoIP — alerta amber: risco maior de bloqueio; preferir maturidade `novo`/aquecimento.
- **`virtual_api`** número virtual que **não recebe ligação/SMS** — alerta rose: **não conecta por QR**
  (Z-API usa protocolo do WhatsApp Web); só funciona na **API oficial do WhatsApp (Meta Cloud API)**,
  que **não é o conector atual**. Gatear conexão por tipo (usar Cloud API) ficou fora do escopo.

**Edge Function `disparar-teste` (atualizada, self-contained):** aceita `{ chip_id, numero_e164? }`;
suporta os dois formatos do config; valida que o `numero_e164` pedido está cadastrado
(`numero_nao_cadastrado`); sem ele, usa o primeiro ativo. **Redeploy pendente** (ver MCP).

**Front (Next.js — vai pra produção no próximo `git push`):**
- `components/TipoChipField.tsx` (novo, padrão visual do `MaturidadeField`) — 4 cards + alerta contextual;
  usado no cadastro (`chips/novo/flow.tsx`) e edição (`chips/chip-card.tsx`); selo de tipo no card.
- `chips/teste-card.tsx` reescrito: lista de números de teste (apelido + ativo + remover + adicionar),
  "Salvar" persiste a lista em `numero_teste`; no disparo escolhe **número alvo** (entre os salvos ativos)
  **+ chip**. `api/chips/teste` repassa `numero_e164`; `chips/page.tsx` normaliza o config para lista.
- `api/chips` (POST) e `api/chips/[id]` (GET/PATCH) aceitam/retornam `tipo`.

**Verificado:** `npm run build` do front OK (14 páginas). **Pendente de aplicar em produção:** migration 018
(MCP `apply_migration`) + deploy de `disparar-teste` (MCP `deploy_edge_function`).
