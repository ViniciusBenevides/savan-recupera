# Envio direto pela Evolution, com o Chatwoot espelhando

O Chatwoot é o console de atendimento do projeto e seria natural mandar as mensagens por ele, como foi
feito até aqui. Decidimos o contrário: **o sistema envia direto na API da Evolution** e deixa a
integração nativa espelhar a mensagem no Chatwoot. O motivo é que a Evolution expõe presença, "digitando…"
e atraso por mensagem — os sinais comportamentais que o WhatsApp usa para separar humano de robô — e
enviar pelo Chatwoot perde esse controle. Num canal não-oficial, onde o único juiz é comportamental,
abrir mão desses sinais é abrir mão da principal defesa disponível.

## Consequences

A mensagem passa a existir em dois sistemas quase ao mesmo tempo, o que já produziu uma corrida real em
produção (a autoria de uma abordagem do robô foi gravada como humana porque o webhook do Chatwoot
chegou antes da resposta da API). A reconciliação por identificador de mensagem, com preservação da
autoria já conhecida, é obrigatória e não é otimização.

Um leitor que abrir o código esperando encontrar `POST /messages` do Chatwoot não vai achar — e essa é
exatamente a pergunta que este ADR responde.
