---
name: fluxo-do-robo
description: "Como mexer no fluxo/roteiro de conversa do robô de cobrança sem repetir os erros que já derrubaram chips e banaram a conta oficial. Use SEMPRE que a tarefa tocar em: roteiro, fluxo do robô, etapas, blocos, casos, primeira mensagem, abordagem, disparo, follow-up, reenvio, opt-in, texto que o bot manda, o que o bot responde, encerramento, escalação, ou a tela 'Fluxo do robô' do painel. Vale também quando o pedido parecer inofensivo ('só troca essa frase', 'adiciona um bloco', 'melhora o texto da abordagem') — é justamente aí que as regras caras são atropeladas sem ninguém perceber."
---

# Fluxo do robô — mexer sem repetir o que já custou caro

Este fluxo não é um roteiro de vendas. Ele é o resultado de uma conta de WhatsApp banida em
definitivo, de dois chips restringidos com três envios, e de conversas reais em que o robô foi
acusado de golpe. Quase toda regra estranha aqui existe porque a alternativa já falhou em produção.

Antes de propor qualquer alteração, entenda **por que** o texto está do jeito que está. Mudar uma
frase sem isso é como remover um `if` sem ler o comentário acima dele.

## Leia isto antes de editar

Na primeira vez que mexer no fluxo numa sessão, leia:

- `docs/adr/0003-opt-in-como-portao-obrigatorio.md` — a decisão que rege a entrada do fluxo
- `contexto-projeto.md`, §38 — o ban da conta oficial e o `ban_reason` textual
- `contexto-projeto.md`, §31 — os dois chips que caíram com três envios

Se a mudança mexer em ritmo, número ou canal, leia também
`Guias Operacionais/Baileys — Guia Operacional.md` §8 (sinais de ban) e
`docs/adr/0004-numeros-voip-e-aquecimento-como-conselho.md`.

## Onde o fluxo mora — três lugares que precisam concordar

| Lugar | Papel |
| --- | --- |
| `fluxo_versoes.roteiro` | Histórico versionado. Nada é sobrescrito, cada save vira versão nova |
| `carteiras.roteiro` | A cópia que o `campanha-lote` lê para montar o texto de disparo |
| `carteiras.fluxo_versao_ativa_id` | Qual versão está valendo |

`PATCH /api/carteiras/[id]` com `roteiro` faz os três de uma vez, com rollback se a versão falhar —
é o caminho certo, e é o que a tela usa. **Escrever direto na tabela por SQL é a falha silenciosa
clássica**: atualiza um, esquece outro, e o painel passa a mostrar uma coisa enquanto o disparador
manda outra. Se precisar mesmo de SQL, atualize os três na mesma transação e confira depois que
`carteiras.roteiro` e a versão ativa têm o mesmo número de etapas.

## As quatro regras que não se negociam

Elas estão no ADR-0003 e foram escritas assim de propósito: **o modelo pode atropelá-las**, então
não bastam como parágrafo de prompt. Ao revisar um fluxo, verifique cada uma explicitamente.

**R1 — A primeira mensagem pede licença; ela não confirma identidade.**
Pedir permissão e confirmar quem é são etapas distintas, nessa ordem. A conta oficial foi banida com
`bm_reactive_scam_model_enforcement_heuristic`: o antifraude reagiu ao *padrão da abordagem*, não ao
volume. "Falo com a pessoa certa?" como abertura é o padrão que ele lê como golpe.

**R2 — Nada da dívida sai antes de um "sim".**
Nem CPF, nem valor, nem ano, nem processo, nem o nome do credor cedente. Isso inclui frases que
parecem neutras como "uma conta antiga da loja X". Número reciclado é comum: sem o sim, você pode
estar contando a um estranho que fulano deve.

**R3 — Pergunta sobre o assunto destrava; pergunta sobre quem fala, não.**
"Do que se trata?" é interesse e segue o fluxo. "Quem é você?", "isso é golpe?", "não conheço essa
empresa" é desconfiança: vai para esclarecimento **uma vez só**, e o esclarecimento não pode
desembocar na proposta. Tratar desconfiança como consentimento foi exatamente o erro que gerou as
acusações de golpe. Se um `caso` do roteiro juntar os dois numa mesma condição, ele está errado.

**R4 — O "não" é permanente e vale para todos os chips.**
Não é estado de conversa, é trava de banco (`bloqueios_contato`, com gate dentro do
`fn_selecionar_lote`). Com números que caem e são repostos, "não perturbe" como estado deixava o
chip novo recontatar quem tinha recusado pelo antigo.

## A regra do canal — o texto de saída depende do conector do chip

O bloco de disparo tem **duas fontes**, e o conector do chip escolhe qual:

- **`baileys`** → `etapas[tipo=disparo].textos[]`, texto livre, com as variações sorteadas por envio.
  Duas pessoas receberem o texto idêntico é sinal de robô — as variações são remédio anti-ban, não
  enfeite. Suportam spintax `{a|b}` e variáveis `{{primeiro_nome}}`, `{{nome_bot}}`, `{{credor}}`.
- **`meta_cloud`** → `meta_abordagem_template`, modelo aprovado pela Meta, palavra por palavra. A
  abordagem abre a conversa, então está sempre fora da janela de 24h, onde a Cloud API recusa texto
  livre.

Se a carteira tiver chips dos dois tipos, **as duas fontes precisam existir e dizer a mesma coisa**.
Mudar só uma faz metade dos devedores receber a mensagem antiga sem nenhum erro aparecer.

## Checklist de revisão

Rode esta lista contra o fluxo antes de dizer que está pronto:

- [ ] A primeira etapa pede licença, e não confirma identidade (R1)
- [ ] Nenhum texto anterior ao "sim" cita dívida, valor, credor, ano ou processo (R2)
- [ ] Nenhum `caso` junta "perguntou do assunto" com "desconfiou/quem é você" (R3)
- [ ] O caminho de desconfiança não chega à proposta
- [ ] Existe encerramento por pedido de parada, e ele é alcançável de **toda** etapa de conversa
- [ ] Nenhum follow-up usa escassez, prazo, urgência ou consequência ("última chance", "tem prazo")
- [ ] O último follow-up promete parar — e o fluxo cumpre
- [ ] Existe bloco para "troquei de número", já que a rotatividade de chip é regime normal (ADR-0004)
- [ ] Cada balde de devedor tem entrada adequada: quem já respondeu antes não recebe contato frio
- [ ] Os `casos` de cada etapa cobrem hostilidade, ameaça jurídica e pedido de humano
- [ ] Todo `vai_para` aponta para uma etapa que existe
- [ ] As variáveis `{{...}}` usadas existem no renderizador do `campanha-lote`

## Como propor a mudança

Fluxo é conteúdo do dono da operação, não decisão de quem edita o código. O jeito seguro:

1. **Mostre o texto novo ao lado do antigo** e diga qual regra cada mudança atende. "Melhorei o
   texto" não é revisável; "tirei a escassez do follow-up 2 porque R2 e §31" é.
2. **Crie versão nova sem ativar.** `fluxo_versoes` é versionado justamente para isso — a pessoa
   revisa no painel e ativa quando concordar. Trocar `fluxo_versao_ativa_id` sem combinar muda o que
   2.500 pessoas vão receber.
3. **Confira a contagem de etapas** nos três lugares depois de aplicar.

## Armadilhas específicas deste fluxo

- **Não reperguntar identidade depois de confirmada.** A instrução já está em `abrir_assunto` e
  existe porque reperguntar destrói a confiança inteira da conversa.
- **Contextualizar antes de falar em dinheiro.** Despejar valor e desconto logo após o "sim" gerava
  "que conta é essa?" e "nunca comprei aí". Custa uma mensagem e evita a contestação.
- **Prescrição se responde com honestidade total.** Enrolar aqui é o que vira Procon.
- **Objeção de preço tem uma rodada só.** Barganha em laço é padrão de robô e desgasta o número.
- **Etapas de conversa não têm texto fixo** — têm `instrucao`. Só o disparo, os follow-ups e as
  mensagens pós-pagamento têm `textos[]`. Escrever texto fixo numa etapa de conversa engessa o que
  precisava ser resposta ao que a pessoa disse.
- **Falha fechada, sempre.** Na dúvida entre continuar e encerrar, encerrar. O erro caro deste
  projeto nunca foi perder um devedor; foi perder o número.
