# Product

<!-- impeccable:product-schema 1 -->

> Escrito em 16/10/2026 a partir do pedido do Vinicius e da leitura do MC COB V5 e do Savan Recupera;
> revisto em 17/10/2026 com a reunião de 16/10 entre o Vinicius e o Maurelio (`contexto/`, fora do git).
> As referências são só essas duas: o MC COB V5 primeiro, porque é o que o Maurelio usa. O CobCloud
> saiu (ele não assina mais). O que está marcado **[inferido]** não foi confirmado por ninguém.

## Platform

web

## Users

- **Maurelio (dono da MC CRED, Goiânia‑GO)** — compra carteiras de dívida por cessão e cobra. Não é
  técnico. Hoje trabalha no **MC COB V5**, que roda no PC dele (Windows + Chrome), com o WhatsApp Web
  aberto e uma extensão do Chrome. Abre o sistema de manhã e trabalha a fila do dia; confere pelo
  celular. Vocabulário dele: Painel, Central/Agenda, Minha Carteira, Trabalho de Hoje, Credores/
  Carteiras, Devedores/Processos, Ficha 360, Ocorrência, Acordo, Financeiro, Linhas WhatsApp. Na reunião
  de 16/10 ele disse que quer o sistema on-line para a equipe trabalhar no mesmo banco, com "tudo na
  mesma aba", e que o Trabalho de Hoje é do operador: cada um recebe os clientes que forem distribuídos
  para ele. Ele se ofereceu para responder os devedores da SAVAN o dia inteiro.
- **Negociador / cobrador humano** contratado pela MC CRED — trabalha a fila do dia, conversa no
  WhatsApp, registra o resultado de cada contato e fecha acordos dentro dos limites da carteira.
  **[inferido]**: a conversa do ChatGPT cita "MC MAURO JR" como operador responsável.
- **Vinicius (prestador de tecnologia)** — administra a plataforma; ganha 10% do valor recuperado
  (split do Pix no Asaas).
- **Credor** (quando a carteira é de terceiros) — só acompanha. **[inferido]**: as carteiras atuais
  foram compradas, então o credor é a própria MC CRED.

## Product Purpose

Recuperar dinheiro das carteiras compradas. Um operador humano trabalha uma fila diária priorizada,
com o WhatsApp dentro do sistema; a IA sugere resposta, lê datas e promessas e não deixa ninguém
esfriar — mas não fecha acordo sozinha.

Sucesso = reais recebidos por mês, por carteira. Indicadores de apoio: % da base com contato real,
promessas cumpridas, tempo entre "quero pagar" e o Pix pago.

## Positioning

É o jeito de trabalhar que o Maurelio já conhece (fila do dia, Ficha 360, contato → resultado →
agenda, acordo com parcelas) na nuvem, com o WhatsApp conectado, e com uma regra que nenhum dos três
sistemas antigos tinha: **todo "quero pagar", promessa ou retorno vira um compromisso com data que
volta para a fila sozinho**. O humano negocia; o sistema lembra.

## Operating Context

- **Carteira SAVAN Calçados** (crediário de loja de calçados): base de 50.577 registros, R$ 10,78 mi,
  ticket médio R$ 213; ~2.600 devedores higienizados no banco. Dívidas com idade média de 15,8 anos —
  ~99,8% prescritas e nenhuma negativada. O pagamento é **voluntário**: a oferta é quitação com
  desconto e termo de quitação. Outras carteiras compradas entram depois.
- **Pagamento**: Pix pelo Asaas (split 90% credor / 10% tecnologia) ou pagamento na loja.
- **Canal**: WhatsApp em números próprios conectados por QR (não oficial). A conta oficial da Meta da
  MC CRED foi **banida permanentemente em 17/08/2026** — não há API oficial.
- **Regras que não se negociam**: CDC art. 42 (sem constrangimento, ameaça ou exposição a terceiro),
  LGPD (confirmar a pessoa antes de revelar dívida/CPF), honestidade sobre prescrição, nunca citar
  Serasa/SPC/negativação, abordagem só de 8h às 20h em dias úteis, "não" vira bloqueio permanente.
- **Infra**: Supabase no plano grátis (500 MB de banco; o projeto pausa após 7 dias sem uso), Vercel,
  n8n para agendamentos (desligados desde 15/10/2026).

## Capabilities and Constraints

- Stack existente: Next.js 15 + React 18 + Tailwind 3 + Supabase (Auth, Postgres, Realtime, Storage)
  + Edge Functions; deploy na Vercel com `git push main`. Repositório **público**: nada de dado real.
- Já existe e continua: carteiras, devedores com vários telefones, importação de planilha (com "a IA
  organiza"), conversas e mensagens do WhatsApp, envio pelo painel, Pix Asaas, bloqueio "não
  perturbe", escalação para humano, papéis admin/cobrador/credor/visualizador.
- Entra agora: ocorrências (contato + resultado), agenda (retornos e promessas com data), acordos com
  parcelas, fila "Trabalho de hoje", limites de negociação por carteira, responsável por devedor,
  registro de pagamento manual, sugestão da IA na conversa.
- **Fora desta fase**: precatórios e compradores (continuam no MC COB V5), discador/ligação,
  boleto/CNAB, NFS‑e, portal do credor, prestação de contas completa a credor de terceiros.
- **Pedidos do Maurelio na reunião (próximas fases)**: até 10 linhas de WhatsApp dele, conectadas por
  QR; boleto pela API do banco dele ao fechar acordo, com lembrete automático perto do vencimento;
  disparo também pelo Telegram; vender o sistema para outras empresas de cobrança, com equipe de suporte.
- **Em aberto**: quais números de WhatsApp o Maurelio vai conectar; se o "Fluxo do robô" continua
  fazendo a primeira abordagem sozinho; qual banco e qual API de boleto; publicação em produção (só com
  o dono mandando).

## Brand Commitments

- Nome do produto: **MC COB** (é o nome que o Maurelio usa). Empresa: **MC CRED**, hoje "Recuperadora
  de Créditos" no Instagram @mccred.oficial.
- A identidade fica: preto, bronze e ouro, títulos com serifa, o monograma MC COB "Seu parceiro de
  negócios" e a Justiça em bronze (arte do próprio MC COB V5 e do rebrand da MC CRED).
- O que sai é a execução "cara de IA" da V5: brilho e degradê metálico em tudo, sombras coloridas,
  2.715 `!important`, jargão como "Command Center" e "Intelligence Layer".

## Evidence on Hand

- Dados reais só em produção (sem acesso nesta sessão). Telas, prints e vídeo usam **dados de
  demonstração sintéticos**, rotulados como tal.
- Referência visual do próprio Maurelio: `static/design_reference_dashboard.png` do MC COB V5 (o painel
  que ele quer) e a transcrição da reunião de 16/10/2026.
- Não há depoimento, cliente, resultado financeiro nem métrica de recuperação para citar — ainda não
  houve nenhum pagamento confirmado. Nada disso pode ser inventado.

## Product Principles

1. **Humano no comando, IA de copiloto.** A IA escreve rascunho, lê data, classifica e lembra; quem
   decide e fecha é a pessoa.
2. **Nada esfria.** Promessa, retorno, "quero pagar" e parcela viram compromisso com data e voltam
   para a fila no dia certo.
3. **O dia começa pronto.** Abrir o sistema = saber quem chamar agora e por quê.
4. **Uma tela por devedor.** Conversa, dívida, acordo e histórico juntos (Ficha 360).
5. **Cobrança honesta protege o negócio.** Respeitar CDC/LGPD e o ritmo dos números de WhatsApp é o
   que mantém a operação de pé.

## Accessibility & Inclusion

Operador não técnico, possivelmente 40+, em notebook de 1366×768 e no celular: texto de corpo com
16px, contraste AA, alvos de toque de 44px, rótulos em português claro (nada de "lead", "pipeline",
"opt‑out").
