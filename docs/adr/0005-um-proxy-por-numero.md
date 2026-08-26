# Um proxy por número, em vez de um servidor por número

A operação roda numa VPS única com Coolify, que já hospeda n8n, Chatwoot e Postgres. Isso significa
**um IP de saída para todos os números de WhatsApp** — e a causa nº 3 do incidente de 29/06/2026 (§31)
foi exatamente fingerprint correlacionado: dois chips no mesmo aparelho e IP caíram juntos, um
derrubando o outro.

Decidimos **não** dividir a operação em vários servidores. Em vez disso, cada instância da Evolution
sai por **seu próprio proxy**, configurado por instância em `POST /proxy/set/{instance}` (a Evolution
repassa o agente de rede ao Baileys; aceita http, https e socks5).

## Consequências

**A troca de IP deixa de ser uma migração e vira um campo.** Era esta a objeção contra o servidor único:
quando um número cai, trocar o IP dele exigiria mexer na infraestrutura inteira. Com proxy por
instância, é uma chamada de API para aquele número — a operação mais barata do sistema, e ela vai
acontecer com frequência, porque números virtuais caem (ADR-0004).

**Resolve um segundo problema que o servidor dedicado não resolveria:** IP de datacenter é, por si só,
sinal fraco para o WhatsApp. Vários servidores continuariam sendo vários IPs de datacenter. O proxy
deve ser **residencial ou móvel, brasileiro** — é isso que aproxima o tráfego do padrão de uma pessoa.

**O custo é uma dependência externa a mais** no caminho de cada mensagem: se o proxy cai, aquele número
para. Em troca, o raio de alcance de um problema passa a ser um número em vez de todos.

## Alternativas descartadas

**Uma VPS por número.** Caro, lento de provisionar quando um número cai, e não resolve o problema do IP
de datacenter — trocaria um IP correlacionado por vários IPs igualmente marcados.

**Aceitar o IP único.** Repetiria a condição que derrubou dois chips no §31, agora com números VoIP,
que já entram com a pior reputação de registro possível.
