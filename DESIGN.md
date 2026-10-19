---
name: MC COB
description: Painel de cobrança da MC CRED. Livro-caixa escuro em preto, bronze e ouro.
colors:
  capa: "#07090B"
  capa-escura: "#0E1114"
  capa-texto: "#EEE4D9"
  capa-apagado: "#9A8D80"
  papel: "#050608"
  folha: "#0B0F12"
  folha-hover: "#12171B"
  pauta: "#3E2D1F"
  pauta-forte: "#784E2A"
  texto: "#EEE4D9"
  lapis: "#A99B8E"
  tinta: "#E8A15A"
  tinta-media: "#C97834"
  tinta-clara: "#25190F"
  ouro: "#F2C181"
  sobre-tinta: "#160D05"
  margem: "#D66052"
  margem-fundo: "#28110F"
  pago: "#2EC480"
  pago-fundo: "#0B2118"
  atencao: "#F5C45B"
  atencao-fundo: "#281F0D"
  equipe: "#68A4DE"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.125rem"
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "-0.01em"
  lema:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.625
    letterSpacing: "0.16em"
  body:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  body-secundario:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: 1.5
  label:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  meta:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "1.125rem"
  numero:
    fontFamily: "Atkinson Hyperlegible Mono, ui-monospace, monospace"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.5
    fontFeature: "tnum"
  numero-grande:
    fontFamily: "Atkinson Hyperlegible Mono, ui-monospace, monospace"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
    fontFeature: "tnum"
rounded:
  canhoto: "6px"
  controle: "8px"
  botao: "10px"
  painel: "12px"
  full: "9999px"
spacing:
  pagina-celular: "16px"
  pagina-tablet: "24px"
  pagina-computador: "32px"
  bloco: "24px"
  painel: "20px"
  linha: "14px"
  margem-lista: "104px"
  margem-lista-celular: "72px"
components:
  button-primary:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.sobre-tinta}"
    typography: "{typography.label}"
    rounded: "{rounded.botao}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.ouro}"
    textColor: "{colors.sobre-tinta}"
  button-primary-lg:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.sobre-tinta}"
    rounded: "{rounded.botao}"
    padding: "0 20px"
    height: "48px"
  button-outline:
    backgroundColor: "{colors.folha}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.botao}"
    padding: "0 16px"
    height: "40px"
  button-outline-hover:
    backgroundColor: "{colors.tinta-clara}"
    textColor: "{colors.tinta}"
  button-ghost:
    textColor: "{colors.lapis}"
    rounded: "{rounded.botao}"
    padding: "0 16px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.folha-hover}"
    textColor: "{colors.texto}"
  button-quiet:
    textColor: "{colors.tinta}"
    rounded: "{rounded.botao}"
    padding: "0 16px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.margem-fundo}"
    textColor: "{colors.margem}"
    rounded: "{rounded.botao}"
    padding: "0 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.folha}"
    textColor: "{colors.texto}"
    rounded: "{rounded.controle}"
    padding: "0 12px"
    height: "40px"
  panel:
    backgroundColor: "{colors.folha}"
    rounded: "{rounded.painel}"
    padding: "{spacing.painel}"
  nav-item:
    textColor: "{colors.capa-texto}"
    rounded: "{rounded.controle}"
    padding: "0 12px"
    height: "40px"
  nav-item-active:
    textColor: "{colors.ouro}"
    rounded: "{rounded.controle}"
    padding: "0 12px"
    height: "40px"
  row-action:
    backgroundColor: "{colors.folha}"
    textColor: "{colors.tinta}"
    typography: "{typography.label}"
    rounded: "{rounded.controle}"
    padding: "0 12px"
    height: "32px"
  row-action-active:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.sobre-tinta}"
  result-chip:
    backgroundColor: "{colors.folha}"
    textColor: "{colors.texto}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  result-chip-selected:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.sobre-tinta}"
---

# Design System: MC COB

## Overview

**Creative North Star: "O Livro-Caixa de Bronze"**

O MC COB é o sistema que o Maurelio já usa, agora on-line: o mesmo menu, os mesmos nomes e a mesma identidade preta, bronze e ouro do MC COB V5 e da MC CRED. A estrutura vem da caderneta de cobrança (lista pautada, margem vermelha, horas à esquerda, risco de caneta na linha resolvida) e foi passada para um livro-caixa escuro. Quem abre tem que reconhecer o sistema dele; o que muda é a execução, que tira o brilho e o degradê metálico da V5 e deixa filetes de 1px, texto creme e uma só cor de ação.

A densidade é de ferramenta de trabalho para o dia inteiro: notebook de 1366×768, texto de corpo em 16px, contraste alto e brilho baixo. Cada linha da fila tem uma única próxima ação, escrita com o verbo lido da mensagem, e o valor alinhado à direita em algarismos tabulares. Os títulos são serifados em ouro, como no MC COB (Georgia) e no site da MC CRED (Fraunces); todo o resto é Atkinson Hyperlegible, desenhada para ser lida sem esforço.

Rejeições confirmadas pelo dono e pelo PRODUCT.md: a "cara de IA" da V5 (brilho, degradê metálico, sombras coloridas, jargão em inglês) e o painel genérico de SaaS claro.

**Key Characteristics:**
- Fundo preto-grafite, painéis um tom acima, separados por filetes bronze de 1px.
- Uma cor de ação (tinta cobre-dourada); ouro só para títulos e números grandes.
- Verde é pago, vermelho é atrasado ou quebrado, amarelo é esfriando, azul é "com a equipe".
- Dinheiro, datas e horas sempre em Mono tabular.
- A lista pautada com margem vermelha e o risco de caneta são a assinatura.

## Colors

Paleta escura de três camadas (capa, papel, folha) com bronze nas linhas, cobre na ação, ouro nos títulos e quatro cores de estado. A fonte normativa são as variáveis de canal RGB em `globals.css` (`--c-*`), consumidas pelo Tailwind como `rgb(var(--c-x) / <alpha-value>)`, o que permite `bg-tinta/10`, `border-margem/40` e afins.

### Primary
- **Tinta Cobre-Dourada** (tinta): a única cor de ação. Botão principal, links, a ação da linha, a hora na margem, a seta do select, o caret, o anel de foco e o risco de caneta. O texto sobre ela é sempre **Sobre-Tinta**, quase preto.
- **Cobre** (tinta-media): tom mais fundo da tinta, reservado para rampas e a arte da marca.
- **Linha em Foco** (tinta-clara): fundo da linha selecionada, do balão de mensagem da equipe, do bloco "O que a IA leu" e do hover das ações secundárias.

### Secondary
- **Ouro dos Títulos** (ouro): títulos de página e de painel, os números grandes do Painel, o item ativo do menu e o lema. Também é o hover do botão principal. Não é cor de ação.

### Tertiary (estados)
- **Verde de Pago** (pago) com **Fundo de Pago** (pago-fundo): recebido, quitado, parcela paga, desconto real.
- **Vermelho da Margem** (margem) com **Fundo da Margem** (margem-fundo): atrasado, quebrado, "Não perturbe", erro, e o filete vertical da lista pautada (a 55% de opacidade).
- **Amarelo de Esfriando** (atencao) com **Fundo de Atenção** (atencao-fundo): quem esfriou, leitura sensível da IA e a etiqueta "Dados de demonstração".
- **Azul da Equipe** (equipe, `--c-blue` / `--c-violet`): "com a equipe" e "em negociação", como no MC COB.

### Neutral
- **Capa** (capa): a barra lateral e a barra de baixo no celular; **Capa Escura** (capa-escura) é o hover dela. Texto da capa em **Creme da Capa** (capa-texto), títulos de grupo em **Bronze Apagado** (capa-apagado).
- **Papel** (papel): o fundo da página, o mais escuro.
- **Folha** (folha): painéis, campos, a ficha lateral e a barra de cima; **Folha em Hover** (folha-hover) é o hover das linhas e dos botões fantasma.
- **Pauta** (pauta): o filete bronze de 1px de todo painel, linha e divisória.
- **Pauta Forte** (pauta-forte): borda de campo, de botão contornado, de checkbox e de chip.
- **Creme** (texto): texto principal.
- **Lápis** (lapis): texto secundário, rótulos, placeholders (a 70–80%), notas embaixo dos números.

### Named Rules
**The Uma Tinta Rule.** Só a tinta cobre-dourada chama para ação. Ouro é título, verde é pago, vermelho é atraso: nenhum deles vira botão.

**The Cor de Estado É Texto Rule.** A situação do devedor aparece como texto colorido (Em negociação, Não perturbe, Quitado), não como pílula. Os fundos de estado (`*-fundo`) são para avisos e blocos, não para etiquetar linhas.

## Typography

**Display Font:** Fraunces (com Georgia, serif)
**Body Font:** Atkinson Hyperlegible Next (com system-ui, sans-serif)
**Label/Mono Font:** Atkinson Hyperlegible Mono (com ui-monospace, monospace)

**Character:** Serifa editorial em ouro para nomear as coisas (a página, o painel, o devedor), e uma sem-serifa de legibilidade máxima para tudo que se lê o dia inteiro. A Mono da mesma família dá aos valores e horas um alinhamento de livro-caixa sem mudar de voz.

### Hierarchy
- **Display** (Fraunces 600, 1.875rem / 2.125rem, -0.02em, ouro): título de página ("Olá, Maurelio", "Trabalho de hoje", o nome na ficha completa, "Entrar no sistema").
- **Headline** (Fraunces 600, 1.375rem / 1.75rem, -0.01em, ouro): título de painel e de seção ("Carteira por credor", "Funil de cobrança"), o nome na ficha resumida e estados vazios.
- **Title** (Atkinson 700, 0.9375rem): título de grupo da fila, colorido pelo tom do grupo (vermelho para quem espera, amarelo para quem esfriou), com a contagem em Mono meta ao lado.
- **Body** (Atkinson 400, 1rem / 1.5rem): texto corrido e nomes nas linhas (700). Parágrafos explicativos limitados a 60ch.
- **Body secundário** (Atkinson 400, 0.9375rem): subtítulos de página, mensagens, campos, itens de menu. É o tamanho mais usado depois do corpo; hoje é valor arbitrário (`text-[0.9375rem]`), sem nome no config.
- **Label** (Atkinson 600, 0.875rem / 1.25rem): rótulos de campo, ações da linha, chips de resultado, links de painel.
- **Meta** (Atkinson 400–600, 0.8125rem / 1.125rem, lápis): rótulos dos números do Painel, carteira ao lado do nome, notas, títulos de grupo do menu. Em caixa normal.
- **Número** (Atkinson Mono 500, 0.9375rem, tabular): valores em reais, horas da margem, datas, CPF. **Número grande** (Mono 600, 1.125rem, ouro ou cor de estado) nos números do Painel; o placar "9 de 35 riscados" usa Mono 600 no tamanho headline, em tinta.
- **Lema** (Fraunces 500, 0.8125–0.9375rem, maiúsculas, 0.16em, ouro, filete de tinta de 2px à esquerda): só "Disciplina em cada processo. Resultado em cada negociação.", no Painel e no login.

### Named Rules
**The Dinheiro em Mono Rule.** Todo valor em reais, hora, data e contagem que se compara é Atkinson Hyperlegible Mono com `tabular-nums`, alinhado à direita quando está em coluna.

**The Caixa Alta Só no Lema Rule.** O único texto em maiúsculas espaçadas é o lema da marca. Rótulos, grupos do menu e títulos de grupo ficam em caixa normal; nada de sobretítulo em caixa alta acima de um título.

## Layout

A moldura é fixa: barra lateral de 17rem (capa, `lg` em diante) com o monograma no topo, os grupos Visão geral, Operação, Inteligência e Especialidades, e Configurações separada por filete no rodapé; barra de cima de 64px (folha a 95% com desfoque leve) com a busca de até 32.5rem, a etiqueta de demonstração e quem está logado.

O conteúdo das páginas de leitura (Painel) vai até 1280px, com respiro lateral de 16 / 24 / 32px (celular / tablet / computador), 24px no topo e 24px entre blocos. Painéis têm 20px de respiro lateral e linhas de 14px de altura de respiro. A faixa de números do Painel vai de 2 colunas a 3 (`sm`) e a 6 (a partir de 1300px), separadas por filetes desenhados como sombra de 1px. Os dois painéis lado a lado usam colunas 1.15fr / 1fr.

O Trabalho de Hoje é uma tela de operação de altura total: a lista rola sozinha e a ficha resumida fica ao lado, com 20rem em `lg` e 24.5rem em `xl`, sem rolar a página. A linha da fila tem dois desenhos: largo (margem, nome, ação, valor em colunas) no tablet e a partir de 1280px; estreito (nome e valor em cima, motivo, ação embaixo) no celular e entre 1024 e 1279px, onde a ficha aperta a lista. Abaixo de 1280px a ficha mantém à vista o que a IA leu, mas o rascunho da resposta pede uma rolagem; essa é a promessa aceita para essa faixa. No celular a ficha abre por cima da lista, em tela cheia.

A margem da lista pautada é uma variável (`--margem`): 104px no computador, 72px no celular, 76px nas últimas ocorrências do Painel.

No celular, a barra de baixo leva Hoje, WhatsApp, Agenda e Painel, mais "Menu", que abre uma gaveta lateral de 82% (até 320px). Alvos de toque sobem para 44px com `pointer: coarse`: o que tem caixa (botão md, campo, aba, dia da semana, item do menu) cresce de verdade; link de texto, ícone, chip, interruptor e botão sm ganham a área invisível de `.alvo-toque` (um `::after` de no mínimo 44×44 centrado no elemento), sem mudar o desenho.

## Elevation & Depth

O sistema é plano. A profundidade vem de camadas tonais (papel → folha → folha em hover → tinta-clara na seleção) e de filetes bronze de 1px, não de sombra. Painéis, linhas, a ficha e as barras ficam no mesmo plano.

### Shadow Vocabulary
- **Flutua** (`box-shadow: 0 16px 40px -16px rgba(0,0,0,0.85), 0 0 0 1px rgba(232,161,90,0.10)`): só o que flutua por cima da tela, como o menu da conta e listas suspensas.
- **Sobe** (`box-shadow: 0 1px 2px rgba(0,0,0,0.5)`): o botão redondo do interruptor.

### Named Rules
**The Filete, Não Brilho Rule.** Painel é borda de 1px em pauta sobre folha. Sem brilho em volta, sem sombra colorida, sem degradê metálico.

**The Faixa do Item Ativo Rule.** O único degradê da interface é o do item ativo do menu, herdado do MC COB: faixa de bronze que esmaece para transparente, com filete de tinta de 3px à esquerda. Ele marca lugar; não é decoração e não se repete em painel ou botão.

## Shapes

Cantos discretamente arredondados em três degraus: 8px para controles (campos, itens de menu, ações da linha), 10px para botões e 12px para painéis e balões. Os canhotos das parcelas usam 6px com borda tracejada. Pílula inteira só onde é forma de seleção ou medida: chips de resultado do contato, contadores do menu, barras de progresso de 4px e a régua de parcelas. Balões de mensagem têm 12px com o canto do lado de quem falou reduzido a 4px.

As linhas são o que dá forma: filete horizontal de 1px entre linhas, filete vertical vermelho da margem atravessando a lista inteira e o risco de caneta de 2px, com cantos de 2px, cruzando o nome.

## Components

### Buttons
Diretos e táteis: rótulo em 600, sem ícone decorativo, e todos afundam um pouco ao clicar.
- **Shape:** cantos de 10px; alturas de 32px (sm, 0.875rem, com área de toque de 44px por `.alvo-toque`), 40px (md, 0.9375rem, 44px no toque) e 48px (lg, 1rem).
- **Primary:** fundo tinta, texto sobre-tinta, 16px de respiro lateral. É a ação que leva adiante.
- **Hover / Focus:** o fundo passa para ouro; foco visível é contorno de 2px em tinta, afastado 2px. Transição de 150ms na curva `saida`; ao clicar, `active:scale-[0.97]`. Desabilitado fica a 45%.
- **Outline:** fundo folha, borda pauta-forte, texto tinta; no hover a borda vai a tinta/50 e o fundo a tinta-clara.
- **Ghost:** texto lápis, sem fundo; no hover fundo folha-hover e texto creme.
- **Quiet:** texto tinta sem fundo; no hover tinta-clara. Usado nos links de ação do rodapé da ficha.
- **Danger:** fundo margem-fundo, borda margem/35, texto margem.

### Chips
- **Style:** resultado do contato como grupo de rádio em pílula: fundo folha, borda pauta-forte, texto creme em label 600, 6px × 12px de respiro (8px no toque).
- **State:** selecionado vira fundo tinta com texto sobre-tinta; "Outro resultado…" é pílula sem borda em tinta.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** folha sobre papel.
- **Shadow Strategy:** nenhuma; ver Elevation & Depth.
- **Border:** 1px pauta. Cabeçalho de painel separado por filete, com título em Fraunces ouro à esquerda e um link em tinta à direita.
- **Internal Padding:** 20px lateral, 14px vertical por linha.
- **Ações rápidas:** cartões de ação com borda pauta-forte, ícone em tinta e título que fica ouro no hover, com `active:scale-[0.98]`.

### Inputs / Fields
- **Style:** fundo folha, borda pauta-forte de 1px, cantos de 8px, 40px de altura (44px no toque), texto 0.9375rem; placeholder em lápis a 70%.
- **Focus:** borda tinta e anel de 2px em tinta/15; caret em tinta.
- **Error / Disabled:** desabilitado em folha-hover com texto lápis; erro é faixa margem-fundo com texto margem abaixo do campo.
- **Controles nativos no tema:** select com seta própria em tinta; ícone do calendário tingido de cobre; checkbox de 16px (20px no toque, com área de 44px) com borda pauta-forte, marcado em tinta com o visto em sobre-tinta.

### Navigation
- **Barra lateral:** itens de 40px em 0.9375rem, ícone de 18px em tinta/80, texto em creme da capa a 85%; hover em capa-escura. Grupos rotulados em meta 600, bronze apagado, caixa normal.
- **Ativo:** a faixa de bronze com filete de tinta de 3px, texto e ícone em ouro, peso 700. Contadores em pílula Mono (tinta quando ativo, branco a 10% quando não).
- **Celular:** barra de baixo em capa com rótulos curtos de 0.75rem 600, ativo em ouro, pendência como ponto vermelho.

### Lista Pautada (assinatura)
A fila do dia é uma página de livro-caixa: filete vertical vermelho da margem (1px, margem a 55%) atravessando todos os grupos, a hora em Mono tinta à esquerda dele (vermelha quando atrasada), nome em 700, carteira em meta lápis, motivo em lápis, uma única ação em caixa de 32px (cantos de 8px, borda pauta-forte, texto tinta; preenchida de tinta na linha selecionada) e o valor em Mono à direita. Linha mínima de 60px; selecionada em tinta-clara.

### O Risco de Caneta (assinatura)
Ao registrar o resultado, um traço de 2px em tinta atravessa o nome da esquerda para a direita (`clip-path`, 220ms, sem atraso). A linha então fecha (`grid-template-rows` de 1fr a 0fr e opacidade, 200ms depois de 300ms de espera, na curva `saida`), sai da lista no `transitionend` (com rede de segurança de 1.5s) e reaparece em "Feito hoje" riscada a 60%. O placar e a régua sobem junto com o traço, não depois. Com movimento reduzido, tudo é imediato. O mesmo risco marca as parcelas pagas no carnê.

### Ficha Resumida
Coluna fixa ao lado da fila: nome em Fraunces ouro, CPF mascarado em Mono com olho para mostrar, situação em texto, quadro de dívida e proposta em Mono (desconto real em verde), as últimas mensagens em balões, o bloco "O que a IA leu" em tinta-clara com borda pauta-forte (atenção quando sensível) e o rascunho da resposta. O rodapé é fixo e tem uma só ação de 48px: "Enviar e ir para o próximo →" ou "Registrar e ir para o próximo →", com o resultado escolhido logo acima e "· trocar".

### Carnê
Cada parcela do acordo é um canhoto de borda tracejada e cantos de 6px: paga em pago-fundo e riscada, atrasada em margem-fundo, vence hoje em tinta-clara com borda tinta, futura em folha. Acima de 10 parcelas numa linha de lista, vira régua de 10px em pílula com o resumo "x de y pagas".

### Marca
O monograma MC COB "Seu parceiro de negócios" é o raster do MC COB V5 (`public/marca/mc-cob.png`), sem edição, assentado no preto com `mix-blend-lighten`, contraste 1.25 e máscara radial que esmaece as bordas. No login, a arte da Justiça em bronze (`public/marca/login-justica.png`) ocupa a coluna esquerda com o lema sobre o piso preto.

## Do's and Don'ts

### Do:
- **Do** usar folha (#0B0F12) com filete pauta de 1px para todo painel, linha e divisória.
- **Do** reservar a tinta (#E8A15A) para o que se clica e para o risco; texto sobre ela sempre em sobre-tinta (#160D05).
- **Do** pôr títulos de página e de painel em Fraunces 600 ouro, nos tamanhos `pagina` (1.875rem) e `titulo` (1.375rem).
- **Do** escrever todo valor, hora e data em Atkinson Hyperlegible Mono tabular.
- **Do** mostrar a situação como texto colorido: verde pago, vermelho atrasado ou quebrado, amarelo esfriando, azul com a equipe.
- **Do** dar a cada linha uma única próxima ação e a cada painel de operação uma única ação de rodapé.
- **Do** rotular dados de demonstração sempre ("Dados de demonstração" na barra de cima; faixa no celular).
- **Do** usar a curva `saida` (cubic-bezier(0.23, 1, 0.32, 1)) e `active:scale-[0.97]` nos botões; com movimento reduzido, mudar na hora.
- **Do** dar 44px de alvo a todo clicável no toque (`.alvo-toque` em link de texto, ícone e chip); a dica (i) abre no toque e fecha ao tocar fora.

### Don't:
- **Don't** usar sobretítulo ou rótulo em maiúsculas espaçadas; a caixa alta espaçada é só do lema da marca.
- **Don't** pôr a situação do devedor em pílula colorida.
- **Don't** usar brilho, sombra colorida, anel luminoso ou degradê metálico em painel, botão ou texto (é a "cara de IA" da V5 que saiu).
- **Don't** usar sombra para separar painéis; sombra só no que flutua (menu, lista suspensa).
- **Don't** usar ouro, verde ou vermelho como cor de botão principal.
- **Don't** escrever jargão em inglês na interface ("lead", "pipeline", "Command Center").
