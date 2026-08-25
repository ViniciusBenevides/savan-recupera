# Números VoIP e aquecimento sem trava — decisão do dono, com a evidência registrada

Duas escolhas deste projeto contrariam a recomendação técnica levantada durante o desenho. Estão aqui
para que ninguém as desfaça no futuro achando que foram descuido: **foram decididas com a evidência
contrária na mesa**.

**1. Os chips são números VoIP.** A evidência apresentada foi que o WhatsApp detecta origem VoIP no
registro e trata a categoria como sinal negativo de partida — é justamente a origem que ele mais recusa.
A alternativa avaliada foi eSIM de operadora virtual em rede real (Salvy), que registra como linha comum.
O dono escolheu VoIP.

**2. O aquecimento é conselho, não trava.** A alternativa avaliada foi impedir que um chip novo faça
abordagem antes de cumprir dias conectado, perfil completo e tráfego de mão dupla — travando na seleção
de lote, não no aviso de tela. O histórico pesa a favor da trava: os chips restringidos em 29/06/2026
tinham sido criados nos dias 21/06 e 24/06 e caíram com três envios. O dono escolheu manter a decisão
com o operador, com o painel emitindo veredicto de risco visível.

## Consequences

O sistema é projetado assumindo **alta rotatividade de chips**: números vão cair, e cair com frequência.
Isso não é modo de falha, é regime normal de operação — e é a razão de o [ADR-0001](./0001-conversa-pertence-ao-devedor.md)
ancorar a conversa no devedor em vez de no número, e de o índice de saúde por taxa de entrega existir.

Se um dia a operação migrar para eSIM em rede real, ou se o aquecimento virar trava, **este ADR deve ser
substituído, não apagado** — a decisão anterior e o porquê dela continuam sendo o contexto que explica o
desenho do resto do sistema.
