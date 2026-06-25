# Manual do Usuário — Recupera

> Guia de operação do painel, escrito para quem **vai usar** a plataforma no dia a dia
> (não exige nada de técnico). O nome "Recupera" é o padrão do produto (white-label) —
> na sua conta pode aparecer outro nome.

---

## 1. O que a plataforma faz

A Recupera faz **recuperação de crédito por WhatsApp** de forma automática:

1. Você sobe uma **planilha de devedores** (vira uma **carteira**).
2. O robô envia a primeira mensagem, **confirma a identidade** da pessoa e oferece
   **quitação com desconto**.
3. Quem aceita recebe um **Pix** (com repasse automático: 90% para o credor, 10% de comissão).
4. Quem paga recebe **confirmação + termo de quitação** automaticamente.
5. Quem não responde recebe **follow-up** (até 3 vezes); casos delicados vão para **atendimento humano**.

Você controla tudo pelo painel: ligar/desligar, descontos, mensagens, chips e relatórios.
**O robô roda sozinho** depois de configurado.

---

## 2. Primeiro acesso

1. Abra a **URL do painel** e faça login com o e‑mail e a senha que você recebeu.
2. Clique no seu **nome** (canto inferior esquerdo) → **Minha conta** → troque a senha.
3. No rodapé da barra lateral (ou no canto do login) há o **botão de tema** ☀️/🌙
   (claro/escuro) — escolha o que preferir; fica salvo.

**Perfis de usuário** (4 níveis, definidos em Configurações):
- **Admin** — dono da plataforma (único). Vê tudo de todas as contas, com atribuição, e cuida da
  infraestrutura. Ninguém mais pode virar admin.
- **Cobrador** — o operador. Vê e edita **só o que é dele** (suas carteiras, chips, mensagens,
  descontos e chaves). Cria os próprios credores e visualizadores.
- **Credor** — dono da carteira. **Só leitura** do andamento das suas carteiras. Nunca vê chaves,
  wallet ou chips.
- **Visualizador** — só leitura (relatórios, devedores), no escopo de um cobrador.

> Cada **cobrador** tem a **sua própria** Campanha, Mensagens, Descontos e chaves. O **admin** vê e
> controla tudo, mas **separado por conta**: nessas telas há um **seletor de conta** ("Padrão global
> da plataforma" ou a conta de um cobrador), deixando claro de quem é o que está na tela.

---

## 3. Conceitos rápidos

| Termo | O que é |
|---|---|
| **Carteira** | Um conjunto de devedores (uma planilha importada). Você pode ter várias. |
| **Chip** | Um número de WhatsApp (Salvy + Z‑API) por onde o robô fala. |
| **Campanha** | A "chave geral" que liga/desliga os disparos de toda a operação. |
| **Modo simulação** | Roda tudo **sem enviar** mensagem de verdade (para testar com segurança). |
| **Fila** | Os devedores aguardando o primeiro contato. |
| **Follow-up** | Reenvio automático para quem não respondeu. |
| **Aquecimento** | Subida gradual do volume por chip (30→100→250→400→500/dia em 30 dias). |

---

## 4. Como colocar no ar (passo a passo)

Faça **nesta ordem**. Cada item é uma tela da barra lateral.

1. **Configurações → Chaves.** Preencha a `OPENAI_API_KEY` (**sem ela o robô não responde**)
   e a chave de produção do Asaas, quando for para valer. No mesmo lugar dá para escolher o
   **modelo de IA do robô** (o sistema sugere o melhor custo‑benefício e o melhor para cobrança).
2. **Chips.** Cadastre cada número: **Chips → Novo chip**, leia o **QR Code** com o WhatsApp do
   chip. Quando conectar, o chip aparece como _aquecendo_ → vira _ativo_ sozinho.
3. **Carteiras → Nova carteira.** Baixe o **modelo de planilha**, preencha e suba o arquivo — ou
   suba a **sua planilha fora do padrão** e deixe a **IA organizar** (você revisa antes de gravar).
   Confira o **relatório** (quantos entraram / foram ignorados). A carteira nasce **Pausada**.
4. **Mensagens** e **Descontos.** Ajuste os textos e as faixas de desconto (por conta, e ainda dá
   para sobrescrever por carteira).
5. **Campanha → Modo simulação LIGADO.** Ligue a campanha em simulação e confira nos
   **Relatórios/Devedores** que o fluxo roda sem enviar nada. Para testar de ponta a ponta no seu
   próprio WhatsApp, use o **Enviar teste** em Chips (veja §5 → "Testar antes de disparar").
6. **Ative a carteira** (na tela da carteira) e, quando tudo estiver certo, **desligue o Modo
   simulação** em Campanha. A partir daí, é envio real (sempre dentro da janela 8h–20h, só em
   **dias úteis** — seg a sex — e **pulando feriados nacionais**).

> ⚠️ **Antes do envio real:** o robô só funciona com a campanha **ligada** _e_ a carteira
> **Ativa** _e_ o Modo simulação **desligado**. Qualquer um desses desligado = nada é enviado.

---

## 5. Tela por tela

### Visão geral
Página inicial: **cartões** com os números do dia, o **funil** (enviados → respostas → acordos →
pagos) e um **feed ao vivo** dos pagamentos. É o seu "raio‑x" diário.

### Carteiras
Lista das suas carteiras com status (_Importando / Ativa / Pausada / Arquivada_), nº de devedores
e saldo. Em **Nova carteira** você baixa o modelo, sobe a planilha e vê o relatório. Se a planilha
**não seguir o modelo**, escolha a opção **"a IA organiza"**: a IA lê uma amostra, monta o
**de‑para** das colunas (CPF, nome, saldo, telefone…) e mostra uma **prévia** — você revisa/ajusta
e só então importa. Ao abrir uma carteira, há abas: **Status & envios**, **Prompt do robô**
(persona/contexto/regras só dessa carteira), **Descontos** e **Importações**. Só carteiras
**Ativas** disparam.

### Campanha
A **chave gigante** liga/desliga a operação **da conta**. Aqui também ficam: **Modo simulação**,
**janela de envio** (horário 8h–20h + **dias de envio**, padrão seg–sex, a opção **pular
feriados nacionais** e um **Calendário de envio** que mostra os dias em que a campanha roda,
lista os feriados nacionais e deixa você **clicar num dia para marcar folga**), **intervalo
mínimo** entre mensagens (12s), o **aquecimento** e o card **Robô** (nome do bot + **modelo de
IA**). Cada cobrador tem a **sua** Campanha; o admin escolhe a conta no **seletor** do topo.

### Chips
Cartões dos números. **Novo chip** → leia o QR. Se o QR não aparecer, a tela explica o motivo
(ex.: assinatura da instância Z‑API vencida). O menu **⋮** do cartão permite **editar** (tokens)
e **excluir** o chip. Um aviso "Chatwoot não vinculado" indica que falta revincular o número.
No cadastro/edição você informa a **maturidade** e o **tipo** do chip (veja abaixo) e vê o **selo
de papel** do cartão: **Bot** (chip do robô) ou **Cobrador · nome** (chip de equipe que recebe as
escalações). Há ainda o card **Número de teste** e o botão **Enviar teste** (veja abaixo).

#### Chip aquecido ou novo?
Um **chip aquecido** é um número que já vinha sendo usado normalmente (conversas/contatos reais).
Um **chip novo** é frio, recém‑comprado. O WhatsApp **bloqueia números novos** que disparam muito
de uma vez — por isso o sistema sobe o volume aos poucos (o **aquecimento**).
- **Número novo (frio):** aquecimento gradual de ~30 dias (`30 → 100 → 250 → 400 → 500` novos
  contatos/dia). Recomendado para chips recém‑comprados.
- **Já aquecido:** rampa curta de segurança (`250/dia` por 3 dias, depois `500/dia`) **ou** um
  **limite diário fixo** definido por você.

O sistema **sugere e explica** a estratégia ao cadastrar/editar o chip, mas **a decisão é sua**.
⚠️ Marcar um número frio como "aquecido" aumenta o risco de bloqueio.

#### Tipo do chip
Além da maturidade, você marca o **tipo** do número (informativo, mas muda o risco e o que conecta):
- **Físico** (SIM) e **eSIM** — conectam normal pelo QR, **menor risco** de bloqueio.
- **VoIP** — conecta por QR, mas com **risco maior de bloqueio**; prefira maturidade "novo"/aquecimento.
- **Virtual (API)** — número que não recebe ligação/SMS: **não conecta por QR** (só funcionaria na
  API oficial do WhatsApp, que não é o conector usado aqui). Evite para o robô.

#### Distribuição entre chips (por carteira)
Quando uma carteira tem **vários chips**, o sistema divide os devedores entre eles —
**ninguém é contatado duas vezes** e cada chip respeita o próprio aquecimento. Em
**Carteira → Status & envios → Distribuição**, escolha a estratégia:
- **Igualitário** — divide o volume proporcional à capacidade de cada chip.
- **Por estado (UF)** — cada chip atende estados inteiros.
- **Por cidade** — cada chip atende cidades inteiras.

Clique em **"Ver sugestão do sistema"**: ele mostra qual chip pega qual região, o **volume** e o
**ETA** (dias estimados, já considerando o aquecimento). Revise e clique em **Aplicar**.

#### Se um chip cair (failover)
Se um chip desconecta ou é banido, aparece um **aviso vermelho no topo** de qualquer tela com o
que ficou preso (fila, conversas em andamento, escaladas). Você **escolhe o chip substituto e
confirma** — nada é migrado sozinho. O chip novo **herda o contexto** (o robô lê todo o histórico
do devedor). Conversas que estavam com humano **continuam com o humano** (não voltam ao robô).

#### Testar antes de disparar (número de teste)
Antes do envio real, teste em **duas camadas**:
- **Modo simulação** (em Campanha): roda todo o fluxo **sem enviar nada** a ninguém.
- **Enviar teste** (em Chips): no card **Número de teste**, cadastre um ou mais números **seus**
  (com apelido). Clique em **Enviar teste**, escolha o **número alvo** e o **chip**; o robô manda a
  1ª mensagem ao seu WhatsApp e abre uma conversa marcada como **teste**. **Responda no seu zap** e
  converse de verdade com o robô — ele negocia e gera um **Pix de teste** (sandbox/fake). **Nada
  real sai** e nada conta nos números.

> Se você responder e o robô não continuar, use **Revincular Chatwoot** no cartão do chip (garante
> o caminho de volta da mensagem). O próprio "Enviar teste" já tenta corrigir isso sozinho.

### Mensagens
CRUD dos **modelos de mensagem** (abertura, follow-ups) com **pré‑visualização**, **por conta**.
Use **"Começar com os modelos padrão"** para clonar o global e ajustar. Use as variáveis do modelo
(ex.: primeiro nome) — **nunca** coloque valor de dívida fixo no texto; o robô calcula.

### Descontos
Editor das **faixas de desconto por idade da dívida** (15+ anos→60%, 10+→50%, 5+→40%, abaixo→30%)
+ a **margem extra única** (+10pp) + **simulador**. É **por conta** (cada cobrador a sua) e ainda
pode ser **sobrescrito por carteira**.

### Devedores
Busca e lista de devedores, com **filtro por carteira** e coluna de **resposta**. Ao abrir um
devedor, você vê a **linha do tempo** (mensagens, proposta, Pix, pagamento).

### Escalações
Registro de todos os casos que o robô **passou para atendimento humano**. Para cada um você vê
**quem escalou, o histórico da conversa, o status** (em aberto / em atendimento / fechada com
acordo / sem acordo / paga) e o **vínculo com o pagamento**. Quando o Pix é confirmado, a
escalação fecha sozinha como **paga**. Acordos fechados fora do Pix devem ser registrados aqui
(valor + observação) para ficarem visíveis. É a transparência dos dois lados.

### Pagamentos
Lista dos Pix gerados e seu status (gerado / pago). Atualiza ao vivo quando alguém paga.

### Relatórios
Gráficos de recuperação e desempenho ao longo do tempo.

### Configurações
**Asaas** (sandbox/produção), **Chaves/segredos** (OpenAI, Asaas), o **Modelo de IA do robô** —
o sistema lista os modelos que a sua chave OpenAI acessa e **sugere** o de melhor **custo‑benefício**
e o **melhor para cobrança** — e **Usuários** (criar usuário, definir papel). O **admin** gere o
**padrão global**; o **cobrador**, a **sua conta**.

### Minha conta
Trocar **nome**, **e‑mail de login** e **senha**.

---

## 6. Atendimento humano (quando o robô passa o bastão)

O robô **escala para humano** sozinho em casos delicados (a pessoa contesta a dívida, fala em
advogado, fica hostil, ou faz uma pergunta complexa). Quando isso acontece, se a carteira tiver um
**cobrador** configurado (aba **Asaas & cobrador** da carteira), o robô **passa o WhatsApp do
cobrador** para a pessoa e **avisa o cobrador** no WhatsApp dele, com um resumo do caso. O
atendimento segue **direto no Chatwoot** — o atendente humano assume a conversa por lá. A partir
desse momento, **o robô não responde mais** aquela conversa (mas continua registrando as mensagens
que chegam, para o humano ter todo o contexto).

Todo caso escalado também aparece na tela **Escalações** (ver §5), com histórico, status e o
desfecho do acordo — para o dono acompanhar e nada se perder.

> Dica: deixe o Chatwoot aberto e fique de olho nas conversas marcadas/atribuídas ao time de
> cobrança. Use a tela **Escalações** para acompanhar os casos em aberto e registrar como cada
> um terminou.

---

## 7. Regras que o robô **nunca** quebra (jurídico)

Estas regras são inegociáveis e já estão embutidas — bom você conhecê-las:

- **Nunca** ameaça ação judicial; **nunca** cita Serasa/SPC/negativação/score.
- Enquadra sempre como **quitação voluntária / encerramento definitivo com termo**.
- Se perguntarem sobre **prescrição**, responde **honestamente** (dívida antiga, pode estar
  prescrita, pagamento é voluntário).
- **Confirma a identidade** antes de revelar CPF/valor (número antigo pode ter trocado de dono).
- Envia só **das 8h às 20h** (horário de São Paulo), em **dias úteis** (seg–sex), **pulando
  feriados nacionais**, com intervalo mínimo entre mensagens.

> **Bloqueante legal:** só dispare de verdade depois do **contrato de cobrança** + **DPA (LGPD)**
> assinados com o credor.

---

## 8. Problemas comuns

| Sintoma | Provável causa / o que fazer |
|---|---|
| **O robô não responde** as mensagens | Falta a `OPENAI_API_KEY` em Configurações → Chaves. |
| **Nada é enviado** | Campanha desligada, carteira não‑Ativa, Modo simulação ligado, fora da janela (horário 8h–20h, fim de semana ou feriado nacional), ou chip sem limite (aquecimento). |
| **QR Code não aparece** | A tela do chip mostra o motivo (ex.: assinatura Z‑API vencida). Resolva e clique "tentar de novo". |
| **"Chatwoot não vinculado"** no chip | Use a opção de revincular o número (no cartão do chip). |
| **Mensagens recebidas não chegam ao robô** | O webhook do Chatwoot precisa apontar para o n8n (`/webhook/savan-bot`). |
| **Pagamento não confirma** | O webhook do Asaas precisa apontar para a função `webhook-asaas`. |

---

## 9. Segurança e limites

- **Não compartilhe** seu login. Crie um usuário por pessoa (Configurações → Usuários) com o
  papel certo (cobrador / credor / visualizador).
- As **chaves** (OpenAI, Asaas) e a planilha real **nunca** saem do ambiente seguro — não as
  cole em chat, e‑mail ou prints.
- Comece sempre com **Modo simulação** e poucos chips; deixe o **aquecimento** subir o volume.

---

### Onde estão as outras docs
- **Visão técnica/arquitetura:** [`contexto-projeto.md`](../contexto-projeto.md)
- **Orquestração n8n (workflows, review, organização):** [`n8n/README.md`](../n8n/README.md)
- **Apresentação do projeto (inglês):** [`README.md`](../README.md)
