# A conversa pertence ao devedor, não ao chip

Os chips deste projeto caem com frequência — dois foram restringidos pelo WhatsApp em 29/06/2026 e o
número oficial da Meta foi banido em 17/08/2026 —, e a operação agora roda sobre números virtuais, que
caem mais ainda. Decidimos que a **conversa é indexada pelo devedor** e que o chip é apenas o transporte
da vez: quando um chip morre, outro assume a mesma conversa com o dossiê inteiro, em vez de recomeçar do
zero. É o oposto do modelo do Chatwoot, onde a conversa vive dentro de uma inbox e a inbox pertence a um
número.

## Considered Options

**Uma inbox do Chatwoot por chip, com o dossiê costurado no nosso banco por devedor** (escolhido). O
Chatwoot não move thread entre inboxes, e a integração da Evolution cria uma inbox por instância — ou
seja, por número. Aceitamos essa fragmentação no console humano e reconstruímos a unidade onde ela
importa: no que o robô lê antes de escrever.

**Uma inbox única para todos os chips.** Não é caminho suportado pela Evolution, e o roteamento de saída
fica ambíguo quando dois números apontam para a mesma inbox.

**Chatwoot como fonte da verdade.** Descartado por consequência direta do primeiro ponto: se a verdade
mora em inboxes separadas, um devedor abordado por três chips ao longo de um ano tem três verdades
parciais e nenhuma completa.

## Consequences

O Chatwoot vira **console do atendimento humano**, não sistema de registro. Toda leitura que decide
comportamento — o que o robô já disse, se a pessoa deu opt-in, se pediu não perturbe — sai do nosso
banco. Isso significa que a sincronização Chatwoot → banco é caminho crítico e não pode falhar em
silêncio: uma mensagem que existe só no Chatwoot é uma mensagem que o robô vai repetir.
