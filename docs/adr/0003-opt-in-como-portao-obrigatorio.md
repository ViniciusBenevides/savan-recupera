# Opt-in conversacional como portão obrigatório

A conta oficial da MC Cred foi banida em 17/08/2026 com `ban_reason =
bm_reactive_scam_model_enforcement_heuristic` — o modelo antifraude da Meta reagiu ao **padrão da
abordagem**, não ao volume: pessoas que não reconheciam a MC Cred (credora por cessão, sem relação
prévia com elas) bloqueavam e denunciavam. Decidimos que a primeira mensagem deixa de ser cobrança e
passa a ser **pedido de permissão**: apresentação com o primeiro nome, quem está falando, e um convite a
autorizar o assunto, com a saída fácil declarada. Nada sobre CPF, valor, ano, processo ou dívida sai
antes de um sim.

Isso troca alcance por sobrevivência do canal, deliberadamente. Uma pessoa que responde "não, obrigado"
não denuncia; uma pessoa surpreendida por um número desconhecido cobrando uma dívida de quinze anos,
sim.

## Considered Options

**Opt-in fora do WhatsApp** (carta, SMS ou e-mail notificando a cessão, falando só com quem reagir).
Reduziria mais o risco, mas depende de operação fora do sistema e corta a maior parte do alcance. Fica
disponível como origem alternativa de contato, não como pré-requisito.

**Continuar com abordagem direta e apenas baixar o ritmo.** Descartado: o ritmo já estava baixíssimo
quando os chips caíram em 29/06 — três envios em três dias — e o ban da Meta veio pelo modelo da
abordagem. Volume não era a variável.

## Consequences

Três regras derivam daí e não são negociáveis no prompt, porque o modelo pode atropelá-las: a **pergunta
de identidade sai da primeira mensagem** (pedir permissão e confirmar identidade viraram etapas
distintas, nessa ordem); **pergunta sobre o assunto destrava, pergunta sobre quem fala não** — tratar
desconfiança como consentimento foi o erro que gerou acusações de golpe; e o **"não" explícito vira
trava de banco**, permanente e válida para todos os chips, presentes e futuros.
