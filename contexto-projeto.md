# Contexto do Projeto — SAVAN Recupera

> Documento para retomar o contexto em novas sessões com Claude.
> Última atualização: **Janela de envio só em dias úteis (seg–sex) e pulando feriados nacionais —
> `dias` vira padrão seg–sex e nova flag `pular_feriados` (feriados fixos + móveis via Páscoa, base
> bancária/ANBIMA), com seletor de dias + switch na tela de Campanha; gate nas Edge Functions
> `campanha-lote`/`campanha-followup` + migration 022 — ver §27.**
> (Anterior: Escalador humano "só registrado" — chip papel=Equipe pode ser cadastrado só
> com nome + número de WhatsApp, sem Z-API/QR/Chatwoot (o dono não quer pagar Z-API pra quem só recebe
> a finalização); trade-off consciente: não aparece no Chatwoot. Mais: editar nome/credor da carteira e
> importador aceita até 6 telefones — ver §25–§26.)
> (Anterior: Vários escaladores (cobradores humanos) por carteira, escolhidos entre os chips
> conectados marcados como Equipe, com estratégia de roteamento (rodízio/região/fixo+reserva) e número
> puxado do chip conectado — ver §24.)
> (Anterior: Seletor de modelo de IA em Configurações — lista os modelos que a chave
> OpenAI da conta acessa e sugere o melhor custo-benefício e o melhor para cobrança — ver §23.)
> (Anterior: Campanha/Mensagens/Descontos por conta (cobrador), com o admin vendo/
> controlando tudo separado por conta (seletor de conta) + correção da saída @lid ("Falha ao
> enviar") — ver §22.)
> (Anterior: Hierarquia de acesso em 4 níveis (admin único · cobrador · credor ·
> visualizador) com isolamento por tenant via RLS, atribuição p/ o admin, self-service de usuários
> e chaves por cobrador — ver §21.)
> (Anteriores: correção do teste ponta a ponta §20, importar planilha fora do padrão com a IA organizando §19, tipo de chip + múltiplos
> números de teste §18, modo teste + papel de chip §17, distribuição/maturidade/failover §16, Central
> de Ajuda §15, conexão de chips ponta a ponta Z-API ↔ Chatwoot §9.12, tema claro/escuro §8,
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
- Envio **8h–20h** America/Sao_Paulo, **só em dias úteis (seg–sex), pulando feriados nacionais**
  (ver §27), intervalo mín. **12s**, aquecimento **30→100→250→400→500** novos contatos/chip/dia em 30 dias.
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
`ASAAS_WEBHOOK_TOKEN`, `OPENAI_API_KEY` (**preenchida** — usada pelo bot e pelo import com IA §19),
`ZAPI_CLIENT_TOKEN`. ⚠️ Runtime do Supabase **bloqueia `Deno.env.set`** → cada Edge
Function lê os segredos via função que **RETORNA um mapa** (não seta env). O dashboard lê a
`OPENAI_API_KEY` direto da tabela `segredos` (via `supabaseAdmin`) para o mapeamento de planilha (§19).

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

**Papéis (4 níveis — ver §21):** admin (plataforma, único, vê tudo com atribuição) · cobrador
(operador, só o que é dele) · credor (dono da carteira, leitura do andamento) · visualizador
(leitura, escopo de um cobrador). Isolamento por tenant via RLS; escrita só admin/cobrador.

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
1. **Chaves** no painel (Configurações → Chaves): `OPENAI_API_KEY` ✅ **já preenchida** (bot + import
   com IA); falta só `ASAAS_API_KEY_PROD` no go-live real.
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

## 18. Tipo de chip (segmentação) + múltiplos números de teste + selo Bot/Cobrador

Pedidos do dono: **segmentar o tipo de número de cada chip**, poder **cadastrar mais de um número de
teste** (escolhendo qual recebe o disparo na hora) e **mostrar no card do chip se ele é do bot ou do
cobrador**. Decisões: tipo de chip é **informativo + alertas** (não muda o disparo); disparo de teste
**escolhe o número alvo na hora**.

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
(`numero_nao_cadastrado`); sem ele, usa o primeiro ativo. **Deployada (v2)** via MCP.

**Front (Next.js — commitado e pushado p/ `main`, deploy automático Vercel):**
- `components/TipoChipField.tsx` (novo, padrão visual do `MaturidadeField`) — 4 cards + alerta contextual;
  usado no cadastro (`chips/novo/flow.tsx`) e edição (`chips/chip-card.tsx`); selo de tipo no card.
- **Selo de papel no card do chip** (`chips/chip-card.tsx`): chip de bot → selo azul "Bot"; chip de
  cobrador → selo violeta "Cobrador · {agente_nome}". Antes só o "equipe" tinha selo e o bot ficava sem
  nada. (O número do cobrador que recebe a escalação continua sendo definido **por carteira**, na aba
  "Asaas & cobrador" → `config_override.equipe` — ver §17.)
- `chips/teste-card.tsx` reescrito: lista de números de teste (apelido + ativo + remover + adicionar),
  "Salvar" persiste a lista em `numero_teste`; no disparo escolhe **número alvo** (entre os salvos ativos)
  **+ chip**. `api/chips/teste` repassa `numero_e164`; `chips/page.tsx` normaliza o config para lista.
- `api/chips` (POST) e `api/chips/[id]` (GET/PATCH) aceitam/retornam `tipo`.

**Aplicado em produção (projeto `wmggqsmqvklxlqwsksjs`):** migration 018 (MCP `apply_migration`, sucesso;
`chips.tipo` default `fisico`, `numero_teste` = `{"numeros":[]}`) + deploy de `disparar-teste` (v2). Build
do front OK (14 páginas).

---

## 19. Importar planilha "fora do padrão" com a IA organizando

Pedido do dono: poder subir uma planilha **formatada diferente** (colunas com outros nomes/ordem,
extras, cabeçalho fora da 1ª linha, valor em centavos, CPF junto do nome) e a **IA organiza para o
padrão aceito**, com **revisão antes de importar**. Sem migration nem Edge Function — tudo no
dashboard (Node runtime), reusando o OpenAI já do projeto (`ia.modelo`, padrão `gpt-4.1-mini`;
`OPENAI_API_KEY` na tabela `segredos`, lida pelo `supabaseAdmin`).

**Arquitetura (a IA decide ESTRUTURA, o código aplica):** a IA vê só uma **amostra** (≈15 linhas) e
devolve uma **"receita"** num schema fechado (de qual coluna vem cada campo, linha do cabeçalho,
qual transform). O código aplica a receita a **todas** as linhas de forma determinística e reusa os
normalizadores atuais (CPF, telefone E.164 + 9º dígito, datas, moeda, e-mails). A IA **nunca**
reescreve linha a linha — não escala e arrisca alucinar PII/valores.

**Receita (enum fechado, sem regex vindo do LLM):** `linha_cabecalho`, `linha_dados_inicio`, e por
campo `{ colunas:[idx], transform }`. Transforms **implementados em código** (a IA só escolhe qual):
`nenhum | centavos | extrair_documento | extrair_telefones | juntar | so_digitos`. Obrigatórios:
`cpf, nome, saldo, telefone` — sem eles a revisão bloqueia o import.

**Backend (`dashboard/`):**
- `src/lib/import/parse-planilha.ts` **refatorado**: separa *extração* de *normalização*. Núcleo único
  `montarDevedores()` (normaliza + dedup por `(carteira,cpf)` + fila) alimentado por dois caminhos:
  `extrairPadrao` (modelo, intacto) e `extrairReceita` (IA). `parsePlanilha(buf, receita?)` orquestra;
  exporta `lerGrade`, `previewReceita`, `CAMPOS_OBRIGATORIOS`.
- `src/lib/import/mapear-ia.ts` (**novo**): monta o prompt da amostra, chama OpenAI
  (`response_format: json_object`, `temperature: 0`) e `validarReceita()` blinda a saída ao schema.
- `api/carteiras/[id]/mapear/route.ts` (**novo**, POST multipart): auth admin/operador, lê a chave
  dos `segredos` (erro `openai_key_ausente` amigável se vazia), devolve **receita + de-para + prévia
  normalizada de 3 linhas — SEM gravar** (não toca `importacoes`). Reenviar uma `receita` editada
  pula a IA e só re-previsualiza (edição manual barata).
- `api/carteiras/[id]/importar/route.ts`: passou a aceitar `receita` opcional no form (revalidada no
  servidor, bloqueia se faltar obrigatório); resto do pipeline de upsert/fila **inalterado**.

**Front (Next.js):**
- `(dash)/carteiras/importador-ia.tsx` (**novo**, compartilhado): seletor `ModoSeletor` ("Minha
  planilha segue o modelo" | "Outra formatação — a IA organiza") + fluxo escolher → **Analisar com
  IA** → painel de revisão (de-para editável por `select` de coluna **e** transform, avisos de
  obrigatório faltando, prévia já normalizada) → **Importar assim**.
- Embutido na aba **Importações** (`carteiras/[id]/painel.tsx` `AbaHistorico`) e na etapa de upload
  do assistente (`carteiras/nova/flow.tsx`). O caminho do modelo padrão segue intacto.

**Status:** implementado no dashboard; `npm run build` + `tsc --noEmit` OK. ✅ **Commitado e
pushado p/ `main`** (deploy automático Vercel). **Limites documentados:** cabeçalho na 1ª linha de
dados, dividir/juntar células e centavos cobertos; planilha com várias tabelas na mesma aba /
cabeçalho multi-linha complexo ficam fora do v1. A amostra (poucas linhas, com PII) vai à OpenAI —
mesmo provedor que o `bot-turno` já usa; mascaramento fica como melhoria futura.

---

## 20. Correção do teste ponta a ponta — a resposta do "devedor" não voltava

Sintoma do dono: no **Enviar teste** (tela de Chips → `disparar-teste`), a **1ª mensagem do bot
chegava** no WhatsApp, mas ao **responder não acontecia nada** — o bot não continuava a conversa.

**Diagnóstico (projeto `wmggqsmqvklxlqwsksjs`; chip 1 = `+556282624555`, inbox Chatwoot 4, conversa
de teste #324 `simulacao=true`):**
- A 1ª msg sai normal (Chatwoot → Z-API → WhatsApp).
- A resposta de entrada **não aparecia na conversa do Chatwoot** e a Edge Function `bot-turno`
  **nunca era invocada** (zero registros nos logs edge-function) → a mensagem morria **antes** do
  cérebro do bot.
- **Tudo a jusante estava saudável:** Chatwoot dispara `message_created` → n8n `/webhook/savan-bot`;
  **W02 ativo**; `OPENAI_API_KEY` **preenchida** (o §4/§10 antigos diziam "vazia" — desatualizado).
- **Único elo quebrado:** o webhook **"ao receber"** da instância Z-API do chip **não apontava pro
  Chatwoot** — por isso nada do que o chip recebia entrava no sistema.

**Causa-raiz (fragilidade do fluxo de conexão):** `finalizarConexaoChip` (`dashboard/src/lib/zapi.ts`)
só roda **na tela do QR** (`api/chips/[id]/qrcode`), e o passo do webhook é frágil: corrida do
`/device` (a Z-API reporta `connected` antes de devolver o telefone → `obterTelefone` volta null e o
bloco do webhook é pulado) e a trava `jaFinalizado` depende de `saude.webhook_ok === true`, que o
**`chips-monitor` sobrescreve a cada ciclo** com o status cru da Z-API. Resultado: o webhook de
entrada podia nunca ficar garantido.

**Conserto manual (já em produção, p/ o chip 1):** `PUT …/update-webhook-received` na instância
Z-API com body `{"value":"<CHATWOOT_URL>/webhooks/whatsapp/+556282624555"}` (retorno `{"value":true}`).
Pela UI o equivalente é o botão **Revincular Chatwoot** (`api/chips/[id]/chatwoot`).

**Conserto permanente (código — ✅ commitado e pushado p/ `main`, deploy Vercel):** garantia auto-curável
amarrada ao próprio "Enviar teste".
- `lib/zapi.ts`: novo **`garantirWebhookEntrada()`** — descobre o número real do chip (fallback ao
  `numero_e164` salvo), resolve a `CHATWOOT_URL` e reaponta o webhook "ao receber" via `definirWebhooks`.
  Idempotente.
- `api/chips/teste/route.ts`: chama `garantirWebhookEntrada` **antes** de disparar; best-effort
  (não trava o envio) e devolve `webhook_aviso` se não conseguir wirar o caminho de volta.
- `(dash)/chips/teste-card.tsx`: exibe esse `webhook_aviso` em amber.
- `tsc --noEmit` OK.

**Como testar:** responda no WhatsApp do número de teste após o disparo → a entrada aparece no
Chatwoot e o `bot-turno` roda (negocia em modo teste, Pix sandbox/fake). **Concluído:** commitado e
pushado p/ `main` (deploy Vercel) → a auto-cura vale em todo chip/teste; o conserto manual já cobria o chip 1.

---

## 21. Hierarquia de acesso em 4 níveis + isolamento por tenant (RLS)

Pedido do dono: o painel era "bagunçado" — vários **admins** viam o que os outros faziam sem saber
**quem criou o quê**. Reestruturado em **4 papéis com isolamento real por tenant**:
- **`admin`** (plataforma, **único** = `vsbenevides1@gmail.com`): vê **tudo de todos, com atribuição**;
  gere a infra global. Ninguém mais pode virar admin.
- **`cobrador`** (era `operador`): o operador. Vê/edita **só o que é dele** (suas carteiras, chips,
  chaves). Cria e liga o próprio credor/visualizadores.
- **`credor`** (dono da carteira): **só leitura** do andamento das **suas** carteiras (ligadas por
  `carteiras.credor_id`). **Nunca** vê chaves de API, wallet id, chips ou config profunda.
- **`visualizador`**: só leitura, escopo de **um cobrador** (tenant via `usuarios_app.cobrador_id`).

**Banco — migrations `019_hierarquia_papeis.sql` + `020_escopo_rls.sql` (aplicadas via MCP no
`wmggqsmqvklxlqwsksjs`):**
- Enum `papel_usuario`: `operador` **renomeado** → `cobrador`; **+ `credor`** (`{admin,cobrador,credor,visualizador}`).
- Colunas de dono: `usuarios_app.cobrador_id`/`criado_por`; `carteiras.cobrador_id`/`credor_id`
  (o texto `carteiras.credor` segue como **rótulo** exibido ao devedor); `chips.cobrador_id`;
  `segredos.cobrador_id` (NULL = global/infra; PK `(chave)` virou 2 índices únicos parciais:
  `uq_segredos_global` + `uq_segredos_cobrador`).
- Backfill: demais admins → cobrador (Maurélio caiu p/ cobrador); carteiras/chips → dono = `criado_por`
  ou o admin.
- Funções de escopo `security definer` (revoke anon, grant authenticated): `fn_carteiras_visiveis()`,
  `fn_chips_visiveis()`, `fn_devedores_visiveis()`, `fn_conversas_visiveis()`, `fn_meu_cobrador()`.
- **RLS reescrita** (antes tudo `select using(true)`): cada SELECT vira `fn_role()='admin' or
  <escopo>`. Carteira-scoped via `carteira_id`; tabelas sem ela via join (`telefones/negociacoes/
  pagamentos` → devedor; `mensagens` → conversa; `failover` → chip). `metricas_diarias` (agregado
  global) = **só admin**. Escrita só `admin`/`cobrador` (no escopo). **`v_funil` já é
  `security_invoker`** → auto-escopa pelos SELECTs.
  - **Decisão do dono — IMPLEMENTADA no §22:** **Campanha, Mensagens e Descontos são por conta
    (por cobrador)**, o cobrador edita os seus e o admin vê/edita os de todos (separado). **Verificado
    por papel** (admin vê 4 carteiras; cobrador 0; credor/visualizador só a sua) com impersonação
    `set role authenticated` + `request.jwt.claims`.

**Decisão central de arquitetura:** todas as páginas `(dash)` leem pelo **cliente anônimo (RLS)**
→ escopar as policies SELECT já isola os dados sem reescrever as queries. As **escritas** passam por
API com **service role** (ignora RLS) → a autorização real é nos **guards** (app layer).

**Front (`dashboard/`):**
- `lib/auth.ts` (**novo**): `getSessao()` (`{user, role, cobrador_id, tenant}`), `exigirAdmin`/
  `exigirCobrador`, `podeEditarCarteira(id)`/`podeEditarChip(id)` (admin OU dono). Substituiu os
  guards `exigirOperador`/`exigirPapel` duplicados em **todos** os `api/**/route.ts`, agora com
  **checagem de dono** nas rotas `[id]` (carteiras/chips/escalações/failover/distribuir/importar/mapear).
- `lib/segredos.ts` (**novo**): `getSegredo(chave, cobradorId)` (chave do cobrador → fallback global);
  `SEGREDOS_POR_COBRADOR = [OPENAI_API_KEY, ASAAS_API_KEY_SANDBOX, ASAAS_API_KEY_PROD]` (Z-API é por
  chip; webhook token é infra). `api/segredos` passou a escopar por cobrador (admin = globais).
- `api/config` está **admin-only** hoje (defaults globais) — **a rever** pela decisão acima
  (Campanha/Descontos/Mensagens por cobrador). `api/usuarios` + `usuarios/criar` viraram
  **self-service**: cobrador cria/liga credor/visualizador no próprio tenant, admin cria cobradores
  e designa tenant; **ninguém vira admin**; credor é ligado a carteiras (`carteira_ids`).
- `components/Sidebar.tsx`: nav **filtrada por papel** (credor/visualizador veem só Visão geral,
  Carteiras, Devedores, Pagamentos, Relatórios, Ajuda). `layout.tsx`: FailoverBanner só admin/cobrador.
  Hoje Campanha/Mensagens/Descontos aparecem **só p/ admin** — pela decisão acima passarão a aparecer
  **também p/ o cobrador** (escopados por conta).
- `configuracoes/{page,form}.tsx` reescritos: Asaas/Bot global só admin; seção de chaves por escopo;
  gestão de usuários p/ admin+cobrador. `carteiras/page.tsx`: colunas de **atribuição** (cobrador/
  credor) p/ admin + ações escondidas p/ leitura. `carteiras/[id]/{page,painel}.tsx`: credor/
  visualizador veem **read-only** e o servidor **remove `config_override`** (sem wallet/keys). Visão
  geral (`(dash)/page.tsx`): gráfico de recuperação derivado de `pagamentos` (escopado), não de
  `metricas_diarias`. **`npm run build` OK (14 páginas).**

**Edge Functions (chaves por cobrador, deployadas via MCP):** `carregarSegredos(sb, cobradorId)`
agora carrega **base global + overlay do cobrador**. `bot-turno` (**v7**) resolve o cobrador via
`carteira.cobrador_id` → usa o **OPENAI_API_KEY do cobrador** (fallback global). `gerar-pix` (**v5**)
idem para a **chave Asaas**. `webhook-asaas`/demais lêem só chaves globais (CHATWOOT/webhook) → sem
mudança. **n8n inalterado.**

**Status:** ✅ **concluído e em produção.**
- Front commitado e **pushado p/ `main`** (deploy Vercel); o banco e as Edge Functions já estão
  aplicados em produção.
- **Campanha, Mensagens e Descontos por conta** — ✅ **CONCLUÍDO no §22** (migration 021 + RLS +
  Edge Functions deployadas + front no ar).

---

## 22. Campanha/Mensagens/Descontos por conta + admin vê tudo separado + saída @lid

Conclui a pendência do §21 (decisão do dono): **cada cobrador tem a SUA Campanha, Mensagens e
Descontos** (edita os seus); o **admin vê e controla tudo, mas separado por conta** (seletor de
conta + padrão global). Mesmo padrão de `segredos`: linha global (`cobrador_id NULL`) + 1 linha por
cobrador; o que o cobrador não personaliza **cai no global**.

**Banco — migration `021_config_templates_por_cobrador.sql` (aplicada via MCP no `wmggqsmqvklxlqwsksjs`):**
- `configuracoes` e `templates_mensagem` ganharam **`cobrador_id`**. Em `configuracoes` a PK `(chave)`
  virou 2 índices únicos parciais (`uq_config_global` + `uq_config_cobrador`), igual a `segredos`.
- **RLS por escopo:** `configuracoes` SELECT = global (todos) + os do próprio cobrador + admin tudo;
  `templates_mensagem` SELECT = admin tudo + os do próprio cobrador (o global é o fallback que o admin
  gere). Escrita só admin (global) ou cobrador (os seus). As escritas do painel passam por API
  service role; as policies blindam o acesso anônimo.
- **`fn_proposta`** (faixas/validade) e **`fn_limite_chip`** (curva de aquecimento) resolvem na
  precedência **carteira override → cobrador → global** (subqueries com índice único = sem
  ambiguidade). **Verificado (SQL):** override de cobrador (faixa 95%) aplica no `fn_proposta`; ao
  remover, volta ao global (60%); precedência da carteira preservada.
- **Chaves por conta** (`lib/config.ts` `CONFIG_POR_COBRADOR`): `campanha_ativa`, `modo_simulacao`,
  `janela_envio`, `intervalo_min_segundos`, `aquecimento`, `faixas_desconto`, `ia` (nome_bot/modelo).
  Infra segue global (asaas global, bot_persona/contexto/guardrails, chatwoot, numero_teste,
  aquecimento_rapido, validade_proposta_dias, followup).

**Edge Functions (deployadas via MCP, self-contained):**
- `campanha-lote` (v3): **gate POR COBRADOR** — agrupa por `chips.cobrador_id`, resolve a config do
  dono do chip e só dispara se a campanha **dele** estiver ligada/na janela; template `abordagem_inicial`
  do cobrador (cai no global).
- `campanha-followup` (v3): idem (gate + template de follow-up por cobrador da carteira).
- `webhook-asaas` (v3): confirmação/quitação usam os **templates do cobrador** dono da carteira;
  pagamento `simulacao` não dispara mensagem real.
- `bot-turno` (v10): resolve o cobrador via `carteira.cobrador_id` → usa o **OPENAI_API_KEY e o `ia`
  (nome/modelo) do cobrador** (fallback global). **Merge com o fix de saída @lid (abaixo).**
- `metricas-sync` (v3): curva de aquecimento por cobrador (mapa `chave|cobrador`, fallback global).
- `_shared/lib.ts` + arquivos no repo atualizados (as deployadas seguem como fonte da verdade).

**Front (`dashboard/`):**
- `lib/config.ts` (**novo**): `getConfigEscopo(cobradorId)` (global + overlay), `setConfig`,
  `CONFIG_POR_COBRADOR`. `lib/auth.ts`: `resolverEscopoConta`/`exigirEscopoConta`/`listarCobradores`.
- `components/SeletorConta.tsx` (**novo**): só p/ admin — escolhe **"Padrão global da plataforma"**
  ou a **conta de um cobrador** (via `?conta=<id>`), deixando explícito "de quem é" o que está na
  tela (separação + controle total).
- **Campanha** (`controls.tsx`): grava no escopo certo; ganhou card **Robô** (nome do bot + modelo
  de IA, antes em Configurações). **Descontos** e **Mensagens**: idem por conta. **Mensagens** ganhou
  "Começar com os modelos padrão" (clona o global → conta) via `api/templates` (CRUD por escopo).
- `api/config` escopa por conta (admin pode mirar um cobrador; cobrador só os seus; chave global só admin).
  `api/templates` (**novo**): criar/atualizar/excluir/clonar_padrao por escopo.
- **Sidebar**: Campanha/Mensagens/Descontos agora aparecem p/ **admin e cobrador**.
- **Separação visível p/ o admin**: seletor de conta nessas telas + selo **"Conta: {cobrador}"** nos
  cards de Chips + colunas de atribuição em Carteiras (§21). Leituras `configuracoes` que quebravam
  com multi-linha corrigidas (`getConfigEscopo` ou `.is("cobrador_id", null)`).
- **`npm run build` + `tsc --noEmit` OK.** ✅ **Commitado e pushado p/ `main` (deploy Vercel).**

**Correção da SAÍDA "Falha ao enviar" (@lid) — bot-turno + Chatwoot:**
- **Diagnóstico:** o chip está conectado e a Z-API envia por telefone OK (testado: `send-text` 200),
  mas o WhatsApp do contato é endereçado por **`@lid`** (privacidade) — o canal Z-API do Chatwoot
  tenta enviar pelo telefone e a Z-API responde **"Phone number does not exist"** → mensagem do bot
  fica vermelha ("Falha ao enviar"). É o oposto do §20 (que era a entrada).
- **Fix (no `bot-turno`, já no repo + deployado):** quando o remetente é `@lid`, o **próprio
  bot-turno envia a resposta via Z-API `send-text` (que aceita `@lid`)**, grava nota privada
  "🤖 (enviado via WhatsApp/lid)" e **retorna `mensagens:[]`** para o n8n W02 **não** repostar no
  Chatwoot (evita o "Falha ao enviar" duplicado). Aprende o `@lid` em `telefones_devedor.chat_lid`
  (coluna nova — migration **`021_chat_lid.sql`**, aplicada via MCP; convive com a
  `021_config_templates_por_cobrador.sql`, mesmo número/escopos diferentes) p/ as próximas respostas
  casarem direto. Contato normal (telefone) segue pelo fluxo Chatwoot→Z-API.
- `lib/chatwoot.ts` `sincronizarProviderConfig` (**novo**) + `api/chips/[id]/chatwoot`: "Revincular
  Chatwoot" agora **reescreve o `provider_config`** (instance_id/token/**client_token**) de um inbox
  já existente — antes só criava (reaproveitava o inbox sem atualizar a credencial). Garante o Token
  de Segurança no canal (necessário p/ a Z-API aceitar envios).
- **Pendência:** `webhook-asaas`/`campanha-followup` ainda enviam confirmação/follow-up só pelo canal
  Chatwoot (telefone); para contatos `@lid` a entrega desses também depende do canal — replicar o
  caminho "enviar via Z-API ao @lid" neles é melhoria futura (o caminho crítico do bot já está coberto).

---

## 23. Seletor de modelo de IA em Configurações (com sugestão de custo-benefício/cobrança)

Pedido do dono: em **Configurações** poder **escolher outros modelos do GPT**, com o sistema
**pegando todos os modelos** da conta e **sugerindo o melhor custo-benefício** e o **melhor para o
cenário de cobrança**. O modelo é a chave `ia.modelo` (lida pelo `bot-turno`); até aqui só dava para
trocá-lo num **input de texto livre** em Campanha (§22).

**Decisão de arquitetura — por que catálogo curado, e não só a API:** o `GET /v1/models` da OpenAI
devolve só os **IDs** que a conta acessa — **sem preço nem capacidade**. Então "melhor custo-benefício"
e "melhor para cobrança" saem de um **catálogo curado** no código, **cruzado** com o que a conta de
fato acessa. Sem chave (ou OpenAI fora), cai no catálogo de referência com aviso.

**Front/back (`dashboard/`, sem migration nem Edge Function):**
- `src/lib/ia/modelos-catalogo.ts` (**novo**): catálogo dos modelos de chat com **preço USD/1M
  tokens** e notas curadas (`inteligencia`, `cobranca`). Cobre as famílias atuais (verificado em
  **2026-06-24**, fonte `developers.openai.com/api/docs/pricing`): **5.x** (gpt-5.5, 5.4, 5.4-mini,
  gpt-5, 5-mini, 5-nano), **4.1** (4.1, 4.1-mini, 4.1-nano), **4o** (4o, 4o-mini) e **raciocínio**
  (o3, o4-mini — nota de cobrança menor pela latência). De fora de propósito: variantes `*-pro`
  (~$30/$180, exagero p/ cobrança). `recomendar(idsDisponiveis)`: **custo-benefício** = maior
  inteligência-por-dólar **entre os de qualidade ≥ 80** (equilíbrio, não o mais barato → tende a
  **gpt-4.1-mini**); **cobrança** = maior nota no cenário (PT-BR + function calling + seguir
  guardrails → tende ao topo de linha, **gpt-5.5**). `custoMisto` pesa entrada/saída 60/40.
  `ehModeloChat(id)` filtra a lista bruta (tira embedding/áudio/imagem/etc.).
  ⚠️ **Preços são de referência — a OpenAI não os expõe por API; atualizar à mão no catálogo
  (cabeçalho do arquivo tem a fonte e a data da última verificação).**
- `src/app/api/ia/modelos/route.ts` (**novo**, GET `[?conta=]`): `exigirEscopoConta` → lê a
  `OPENAI_API_KEY` do escopo (`getSegredo`), chama `GET /v1/models`, marca quais catalogados a conta
  acessa, anexa preço/notas, lista modelos de chat extras (sem preço) e devolve as recomendações.
- `src/app/(dash)/configuracoes/modelo-ia.tsx` (**novo**, client): card **"Modelo de IA do robô"** —
  busca automática, selos **verde "Melhor p/ cobrança"** e **âmbar "Custo-benefício"**, preço e notas
  por modelo, botão Atualizar; salva em `ia.modelo` via `api/config` (escopo do ator, preserva `nome_bot`).
- `configuracoes/page.tsx`: carrega o `ia` do escopo (`getConfigEscopo`; cobrador o seu/cai no global,
  admin o global) e passa ao form. `configuracoes/form.tsx`: renderiza o `ModeloIA` logo após o card
  de **Chaves** (mesmo lugar da `OPENAI_API_KEY`); nota antiga "ajuste o modelo em Campanha" atualizada.

**Escopo:** cobrador edita o **seu** modelo (cai no global se não personalizar); admin edita o
**padrão global**. Mesmo modelo de escopo de §22.

**Mantido (não quebrar):** o input de modelo em **Campanha** (`controls.tsx`) continua válido — grava
a mesma chave `ia.modelo`. Há, portanto, **dois editores** do mesmo campo (Configurações é o rico);
trocar o de Campanha por um atalho ficou como decisão em aberto do dono.

**Status:** `tsc --noEmit` + `npm run build` OK (rotas `/api/ia/modelos` e `/configuracoes` no
output). Vai a produção no próximo `git push` (deploy automático Vercel).

---

## 24. Vários escaladores (cobradores humanos) por carteira + estratégia de roteamento

Pedido do dono: o **chip do escalador continua conectado** (Z-API) — de propósito, pra ver as
conversas dele e fiscalizar acordo por fora ("passar a perna"); e na carteira poder **selecionar
entre os escaladores que existem no sistema** (não digitar número à mão). Decisões dele: cada
carteira tem **1 cobrador-conta + 1 credor**, mas pode ter **vários chips de bot e vários chips de
escalador humano**; a **estratégia de roteamento é escolhida na carteira** (entre 3 opções), com o
número **puxado do chip conectado**.

**Sem migration nem mudança de API:** a lista de escaladores vive no `config_override` (jsonb livre)
que a carteira já tem; todos os campos usados já existem (`chips.numero_e164/regiao_uf/regiao_cidade/
status`, `devedores.uf/cidade`, `escalacoes.equipe_chip_id/atendente_numero`). A rota
`api/carteiras/[id]` (PATCH) já repassa o `config_override` inteiro.

**Formato:** `config_override.escaladores = { estrategia, lista: [{chip_id, nome, numero}] }`
(ordem da lista = prioridade). **Compat:** o formato antigo era um objeto único
`config_override.equipe = {nome, numero, chip_id}` — o bot e a UI ainda leem isso (vira lista de 1,
estratégia `fixo`); ao **salvar de novo**, a carteira migra pro `escaladores` e o `equipe` antigo é
removido.

**Edge Function `bot-turno` (v11, deployada via MCP, self-contained = repo):**
- `lerEscaladores(carteira,cfg)` resolve `{estrategia, lista}` com compat do `equipe` antigo.
- `escolherEscalador(...)` escolhe **1** na hora da escalação (lazy, só no `escalar_humano`): hidrata
  cada item com o chip conectado (**número vem do `numero_e164`**, não do que ficou salvo), descarta
  quem não tem número, e aplica:
  - **rodizio** → escalador com **menos escalação aberta** (conta `escalacoes` em `aberta`/
    `em_atendimento` por `equipe_chip_id`; empate = ordem da lista);
  - **regiao** → casa `devedores.uf`/`cidade` com `chips.regiao_uf`/`regiao_cidade`; **sem match cai
    no rodízio** geral;
  - **fixo** → ordem da lista = prioridade (principal → reservas), **pulando quem está
    `desconectado`/`banido`**; se todos caídos, ainda escala (não trava).
  O resto da escalação é igual ao §17/§22: grava `escalacoes` (com `equipe_chip_id`/`atendente_numero`
  do escolhido), avisa o escalador no WhatsApp **pelo chip do bot** (Z-API send-text), passa o número
  ao devedor e faz nota/label/atribuição no Chatwoot. Tudo guardado por `!simulacao`.

**Front (`dashboard/`, vai a produção no próximo `git push`):**
- `carteiras/[id]/painel.tsx` `AbaAsaas`: o antigo card "Cobrador humano" (1 chip opcional + número
  digitado) virou **"Escaladores (cobradores humanos)"** — **seletor de estratégia** (fixo+reserva /
  rodízio / por região) + **multi-seleção** dos chips marcados como **Equipe** (checkbox por chip,
  com o número conectado e selo **Principal/Reserva N** + botão ↑ pra ordenar a prioridade no modo
  fixo). Mostra **aviso âmbar** se um escalador selecionado **não tem número** (chip não conectado →
  ignorado na escalação). A query passou a buscar `numero_e164/status/regiao_uf/regiao_cidade`.
- O número **não é mais digitado**: vem do `numero_e164` do chip conectado → garante que é um número
  monitorável (a conversa do escalador cai no Chatwoot pra fiscalizar). **Ressalva documentada:** o
  sistema só vê o que passa por esse número — se o escalador desviar o devedor pra outro WhatsApp
  pessoal, some do radar; conectar o chip cobre o handoff oficial, não é blindagem 100%.

**Status:** `tsc --noEmit` + `npm run build` OK (14 páginas; `/carteiras/[id]` compila). `bot-turno`
**deployado (v11 ACTIVE)**. **Pendência:** `git push` na `main` pro front ir a produção (banco/Edge já
estão aplicados). **Não confundir** o *cobrador-conta* da carteira (`carteiras.cobrador_id`, dono da
operação, §21) com o *escalador humano* (chip `papel='equipe'`) — a UI/§ chamam o segundo de
"escalador" justamente pra evitar a colisão de nome herdada do código.

---

## 25. Escalador humano "só registrado" (sem Z-API) — adicionado nesta sessão

Pedido do dono (refinando o §24): o escalador humano **não é bot, não cobra ninguém, só recebe a
finalização** — e ele **não quer pagar uma instância Z-API** só pra isso. Esclarecido o mal-entendido
de que existiria um "QR do Chatwoot" separado: neste produto **o QR vem da Z-API** e o inbox do
Chatwoot é criado **por cima** do canal Z-API (`provider: "zapi"`, ver §9.12) — não há conexão de
WhatsApp no Chatwoot sem Z-API. Decisão do dono: aceitar **registrar o escalador só com nome + número**,
abrindo mão da fiscalização no Chatwoot (o §24 puxava o número do chip conectado **justamente** pra ser
monitorável; aqui é o trade-off oposto, consciente).

**Sem migration nem Edge Function** (o `bot-turno` v11 do §24 já avisa o escalador lendo `chips.numero_e164`):
- **Cadastro (`chips/novo/flow.tsx`):** o seletor **Papel do chip** subiu pro topo. Em **Equipe**, o
  form esconde Z-API/Tipo/Maturidade e pede só **nome do cobrador + número de WhatsApp**; o botão vira
  "Cadastrar escalador" e **não há etapa de QR** (volta direto pra lista).
- **`api/chips` (POST):** se `papel=equipe` **sem** credenciais, valida o número (`normalizarTelefone`
  → E.164), grava em `chips.numero_e164`, **não** cria `chips_credenciais` nem inbox no Chatwoot. Chip de
  bot (ou escalador **com** Z-API) segue exigindo as três credenciais.
- **`api/chips/[id]` (GET/PATCH):** GET devolve `numero_e164` + flag `sem_zapi`; PATCH deixa **editar o
  número** à mão (revalidado p/ E.164).
- **Card (`chips/chip-card.tsx`):** detecta o escalador "só registrado" (`papel=equipe` + `numero_e164`
  + sem `chatwoot_inbox_id`) e **esconde** QR/Ativar/Pausar, "Enviados hoje", badge de tipo/status e o
  aviso "Chatwoot não vinculado"; mostra a linha *"Escalador humano — recebe as transferências no
  WhatsApp. Não dispara campanha nem aparece no Chatwoot."* A edição usa a mesma regra (número editável,
  sem Z-API).

**Caminho antigo preservado:** quem quiser **fiscalizar** um escalador ainda cadastra ele **com** Z-API
(papel Equipe + credenciais → conecta, número vem do `/device`, inbox no Chatwoot) — é só não usar o
atalho "só número". Na carteira (§24, `AbaAsaas`), os escaladores **só registrados** aparecem
normalmente na multi-seleção (têm `numero_e164`), sem o aviso âmbar de "sem número".

**Ressalva (a mesma do §24, agora mais forte):** sem o chip no Chatwoot, o sistema **não vê** a conversa
do escalador com o devedor — ele atende no zap pessoal, fora do radar. É o preço de não pagar Z-API.

**Status:** `tsc --noEmit` + `npm run build` OK (14 páginas; `/chips` e `/chips/novo`).

---

## 26. Ajustes menores — editar carteira + importador até 6 telefones

Dois retoques de usabilidade no dashboard (sem migration/Edge Function), que estavam no working tree e
foram commitados junto:
- **Editar nome/credor da carteira:** `carteiras/[id]/painel.tsx` (`AbaStatus`) ganhou um card
  **"Informações da carteira"** (editar `nome` + `credor`, salva via `api/carteiras/[id]` PATCH); a lista
  (`carteiras/acoes.tsx`) ganhou um **botão de editar** (lápis) que leva ao painel.
- **Importador aceita até 6 telefones:** `telefone3..telefone6` adicionados em `lib/import/modelo.ts`
  (modelo + rótulos), `lib/import/parse-planilha.ts` (tipos `CampoReceita`/`CAMPOS_RECEITA` + extração
  padrão e por receita, agora via `campo.startsWith("telefone")`), `lib/import/mapear-ia.ts` (prompt da
  IA) e `carteiras/importador-ia.tsx` (rótulos do de-para). Antes só `telefone`/`telefone2`.

---

## 27. Janela de envio só em dias úteis + pular feriados nacionais

Pedido do dono: além do horário (8h–20h), a campanha só deve disparar **de segunda a sexta** e
**sem contar feriado**. Antes a janela aceitava `dias` (já existia no JSON `janela_envio`), mas o
**padrão era seg–sáb** `[1,2,3,4,5,6]` e **não havia** noção de feriado.

**Decisões:**
- **Dias úteis (seg–sex)** viram o padrão (`dias = [1,2,3,4,5]`), mas o usuário pode **ajustar** quais
  dias na tela de Campanha (inclusive reativar sábado/domingo).
- **Feriado nacional** computado **em código** (sem dependência externa / sem API): fixos + móveis via
  **Páscoa** (algoritmo de Meeus/Jones/Butcher). Base **bancária/ANBIMA** — inclui Carnaval (seg/ter),
  **Sexta-feira Santa** e **Corpus Christi**, além de Consciência Negra (20/11, nacional desde 2024).
  Flag `janela_envio.pular_feriados` (padrão **true**). Feriados regionais/pontuais opcionais em
  `janela_envio.feriados_extra = ["YYYY-MM-DD", ...]`.

**Onde mudou (o gate da janela é avaliado em 2 Edge Functions + 1 lib de referência):**
- `supabase/functions/campanha-lote/index.ts` e `campanha-followup/index.ts` (self-contained = deployadas):
  `dentroDaJanela`/`dentroJanela` agora têm `feriadosNacionais(ano)` + `ehFeriadoHoje(janela, tz)` e o
  default de `dias` virou `[1,2,3,4,5]`. (O `bot-turno` **não** é gateado por janela — responder a um
  devedor que escreveu vale a qualquer hora; intocado.)
- `supabase/functions/_shared/lib.ts`: mesma lógica na versão de referência (exporta `feriadosNacionais`
  e `ehFeriadoHoje`).
- **Migration `022_janela_dias_uteis_feriados.sql`:** atualiza **todas** as linhas de `janela_envio`
  (global + por cobrador) para `dias=[1,2,3,4,5]` + `pular_feriados=true`, preservando `inicio/fim/tz`.
  Idempotente (só toca linhas que ainda não têm `pular_feriados`).

**Front (`campanha/controls.tsx`):** card **Regras de envio** ganhou o **seletor de Dias de envio**
(botões Seg…Dom, padrão seg–sex marcado) e o switch **"Pular feriados nacionais"**; ambos persistem
dentro de `janela_envio` no mesmo "Salvar". Docs atualizados: manual (`docs/manual-do-usuario.md`) e a
Central de Ajuda (`/ajuda`).

**Pendente de aplicar (outward-facing):** aplicar a migration 022 e **redeployar** `campanha-lote` e
`campanha-followup` (MCP Supabase); o front sai no próximo `git push` da `main`.
