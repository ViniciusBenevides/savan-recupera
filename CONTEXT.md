# SAVAN Recupera

Plataforma de recuperação extrajudicial de crédito por WhatsApp. Um robô aborda devedores de dívidas
antigas, quase todas prescritas, e oferece quitação voluntária com desconto. O vocabulário abaixo é a
linguagem do produto — quando o código e este arquivo divergirem, este arquivo está certo e o código
tem um bug de nomenclatura.

## Crédito e cobrança

**Carteira**:
Um conjunto de dívidas de um mesmo credor, importado de uma planilha. É a unidade de configuração do
robô: cada carteira tem seu próprio fluxo, seus descontos e sua base de conhecimento.
_Avoid_: lote, base, planilha, campanha

**Devedor**:
A pessoa a quem a dívida é atribuída. Existe uma vez só, ainda que tenha vários telefones e seja
abordada por vários chips ao longo do tempo.
_Avoid_: contato, lead, cliente

**Cessão**:
A transferência da dívida do credor original para quem cobra hoje. É o fato que explica por que a
pessoa não reconhece quem está falando com ela.

**Dívida prescrita**:
Dívida cujo prazo legal de cobrança judicial já passou. Praticamente toda a base é assim. O pagamento
é voluntário e não há consequência para quem não paga — dizer isso com honestidade é obrigação, não
escolha.

**Quitação**:
O encerramento definitivo do registro mediante pagamento, formalizado por termo. É o único benefício
que o produto oferece. Um acordo é o caminho; a quitação é onde ele termina.
_Avoid_: negociação, liquidação

**Proposta**:
O valor com desconto oferecido a um devedor, calculado pelo sistema a partir da idade da dívida. O
robô nunca faz essa aritmética.

**Acordo**:
O combinado de pagamento que uma pessoa da equipe registra na ficha: à vista ou em entrada mais
parcelas, sempre dentro dos limites da carteira (desconto máximo, parcelas, entrada e parcela mínima).
Pago por inteiro, vira quitação; uma parcela vencida sem pagamento deixa o acordo atrasado, e quem
parou de pagar tem o acordo quebrado.
_Avoid_: negociação, parcelamento, contrato

**Carnê**:
As parcelas de um acordo vistas em fila, como canhotos: paga é riscada, atrasada fica vermelha. A
entrada é o canhoto zero.
_Avoid_: cronograma, tabela de parcelas

**Recebimento**:
Dinheiro que entrou de verdade: parcela registrada como paga ou Pix confirmado. Só recebimento abate o
saldo; promessa e acordo não.
_Avoid_: pagamento previsto, receita

**Split**:
A divisão automática do pagamento entre credor e operador no momento em que o Pix é pago.

## Pessoas e papéis

**Cobrador**:
A conta que opera a plataforma e é dona de suas carteiras. Só enxerga o que é seu.
_Avoid_: operador, usuário, tenant

**Credor**:
O dono da dívida, que acompanha o andamento da própria carteira em leitura.

**Escalador**:
A pessoa de carne e osso que assume uma conversa quando o robô sai de cena.
_Avoid_: agente, atendente, humano

**Negociador**:
Quem trabalha a fila do cobrador sem configurar nada: responde, registra contato, faz acordo dentro do
limite da carteira e registra pagamento. Acima do limite, pede liberação ao cobrador.
_Avoid_: operador, atendente, vendedor

**Responsável**:
A pessoa da equipe que cuida de um devedor. Quem trabalha um devedor sem dono passa a ser o responsável
por ele.
_Avoid_: dono do lead, atribuído

## Canal

**Chip**:
Uma linha de WhatsApp operada pelo sistema — o transporte de uma conversa, nunca o dono dela. O nome
vem de quando as linhas eram SIM físicos; hoje um chip pode ser SIM, eSIM ou número virtual, e isso não
muda nada no modelo.
_Avoid_: número, instância, sessão, conexão

**Abordagem**:
Uma mensagem enviada a quem não escreveu primeiro. É a única categoria de envio que consome ritmo,
que gera risco de denúncia e que o opt-in governa. Responder quem escreveu não é abordagem.
_Avoid_: disparo, envio, mensagem fria

**Opt-in**:
A permissão explícita do devedor para o robô falar do assunto. Antes dela, o robô só pode se
apresentar e pedir licença — nada de CPF, valor, ano, processo ou a palavra dívida.

**Não perturbe**:
A recusa de um devedor a ser contatado. Vale para sempre e para todos os chips, presentes e futuros.
Nunca é induzida, nunca é condicionada e nunca é confirmada com um "tem certeza?".
_Avoid_: opt-out, descadastro, bloqueio

**Conversa**:
A troca de mensagens com um devedor sobre uma dívida. Pertence ao devedor, não ao chip: quando um chip
cai e outro assume, é a mesma conversa continuando por outro transporte.

**Dossiê**:
Tudo que já foi dito a um devedor, por qualquer chip, em qualquer época, em ordem. É o que o robô lê
antes de escrever e o que impede um número novo de repetir o que o antigo já disse.
_Avoid_: histórico, timeline, thread

**Ritmo**:
Quantas abordagens um chip faz por hora. É a defesa principal contra restrição, mais importante que o
teto por dia, porque é a rajada curta que denuncia o robô.
_Avoid_: velocidade, cadência, throughput

**Índice de saúde**:
A leitura de quão perto um chip está de cair, construída sobre a proporção de mensagens que chegam a
ser entregues. Uma mensagem aceita e nunca entregue é o sinal mais confiável de bloqueio silencioso.

**Aquecimento**:
O período em que um chip novo constrói reputação antes de fazer abordagem. É recomendação do sistema,
não trava: quem decide disparar é o operador.

**Maturidade**:
O estágio de reputação de um chip, que determina quantas abordagens por dia ele pode fazer.

**Janela de envio**:
As faixas de horário e os dias em que abordagens podem sair. Fora dela o robô continua respondendo
quem escreve.

**Failover**:
A passagem do trabalho de um chip caído para outro. O dossiê atravessa junto; a conversa não recomeça.

## Fluxo

**Fluxo**:
O desenho completo do que o robô faz numa carteira, do primeiro contato ao pós-pagamento. É o único
lugar onde o robô se configura.
_Avoid_: roteiro, script, workflow, funil

**Etapa**:
Um ponto do fluxo com um objetivo, uma instrução e as saídas possíveis. Uma conversa está sempre em
exatamente uma etapa.
_Avoid_: nó, estado, passo

**Follow-up**:
Uma segunda tentativa depois do silêncio. Existe uma só, e o silêncio depois dela é definitivo.
_Avoid_: reenvio, insistência, cadência

**Escalação**:
A entrega de uma conversa a um escalador humano. Uma vez escalada, o robô não volta a falar naquela
conversa.

**Balde**:
Como um devedor já contatado no passado é tratado agora: quem respondeu recebe continuidade explícita;
quem nunca respondeu é abordado como se fosse a primeira vez; quem recusou não é contatado nunca mais.

## Trabalho do dia

**Trabalho de hoje**:
A lista de quem chamar agora, em ordem de urgência: quem respondeu e espera, quem esfriou, promessas e
parcelas do dia, retornos marcados e quem nunca foi acionado. É a primeira tela e o lugar de onde quase
todo o trabalho parte.
_Avoid_: dashboard, painel, fila de atendimento

**Ocorrência**:
O registro de um contato com o devedor e do que aconteceu nele (não respondeu, prometeu pagar, pediu
retorno, recusou…). Toda ocorrência entra no histórico da ficha; algumas criam um compromisso na agenda.
_Avoid_: log, evento, interação, tabulação

**Promessa**:
O devedor diz que paga numa data. Vira compromisso na agenda e volta para o trabalho de hoje no dia;
se o dia passa sem pagamento, a promessa é quebrada.
_Avoid_: PTP, compromisso de pagamento

**Retorno**:
Um contato marcado para depois, a pedido do devedor ou por decisão da equipe.
_Avoid_: callback, lembrete, follow-up (follow-up é do robô)

**Agenda**:
Todos os compromissos com data — promessas, retornos e parcelas — de todos os devedores, separados em
atrasados, hoje, amanhã e próximos dias.

**Esfriando**:
Quem quis pagar e sumiu: pediu o Pix e não pagou em duas horas, ou estava numa conversa quente e parou
de responder sem nada marcado. É o grupo que mais rende ligar de novo.
_Avoid_: lead frio, abandono

**Riscado**:
O que já foi resolvido hoje. A linha recebe um risco de caneta e desce para "Feito hoje"; o número de
riscados é o placar do dia.
_Avoid_: concluído, finalizado, ticket fechado

## Operação

**Modo teste**:
O estado em que a plataforma opera contra números de teste, sem cobrança real e sem tocar em devedor
de verdade. É uma propriedade da operação inteira, não um parâmetro de uma tela.
_Avoid_: simulação, sandbox, dry run
