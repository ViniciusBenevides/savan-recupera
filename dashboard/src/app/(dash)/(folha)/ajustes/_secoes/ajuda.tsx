// Ajuda: o jeito de trabalhar no MC COB, em português claro. Curta de propósito — cada tela ensina
// o resto pelo uso (estados vazios, rótulos e o "próxima ação" da ficha).
const SECOES: { titulo: string; itens: string[] }[] = [
  {
    titulo: "O dia começa no Trabalho de hoje",
    itens: [
      "A fila se monta sozinha, na ordem de urgência: quem respondeu e está esperando, quem quis pagar e sumiu, promessas e parcelas do dia, retornos marcados e quem está sem contato há muito tempo.",
      "Clique numa linha: ao lado aparecem a última mensagem, o que a IA entendeu (por exemplo, a data de uma promessa) e uma sugestão de resposta.",
      "Depois de falar com a pessoa, escolha o resultado e clique em Registrar e ir para o próximo. A linha ganha um risco e desce para Feito hoje.",
      "Promessa e retorno viram data: no dia combinado, a pessoa volta para a fila sem ninguém precisar lembrar.",
    ],
  },
  {
    titulo: "Conversas",
    itens: [
      "Todas as conversas de WhatsApp. Quem respondeu por último fica marcado até alguém ler.",
      "Responder pelo painel tira o robô da conversa: daí em diante quem fala é você.",
      "No computador, a ficha resumida aparece do lado direito da conversa.",
    ],
  },
  {
    titulo: "Agenda",
    itens: [
      "Promessas, retornos e parcelas, separados em atrasados, hoje, amanhã e próximos dias.",
      "Feito, Amanhã e Remarcar resolvem na própria linha. Não cumpriu marca a promessa como quebrada e anota no histórico.",
    ],
  },
  {
    titulo: "Devedores e a Ficha",
    itens: [
      "A busca do topo acha por nome, CPF, processo ou telefone.",
      "Minha carteira mostra só os devedores que estão com você. Quem trabalha um devedor sem dono passa a ser o responsável.",
      "A ficha junta tudo da pessoa: dívida, proposta à vista, o que está combinado, a conversa, o acordo e o histórico de contatos.",
      "O CPF aparece mascarado. Só mostre o número inteiro quando precisar conferir a pessoa.",
    ],
  },
  {
    titulo: "Acordos",
    itens: [
      "Fazer acordo fica na ficha. A conta é feita na hora: desconto, entrada, número de parcelas e datas.",
      "Os limites são os da carteira (Carteiras → Regras de negociação). O negociador não passa do desconto máximo; acima disso, só o dono da operação libera.",
      "Registrar pagamento na parcela abate de verdade: quando a última parcela é paga, o acordo é quitado e a pessoa sai da cobrança.",
    ],
  },
  {
    titulo: "Financeiro",
    itens: [
      "Tudo o que entrou no período: Pix e parcelas pagas por qualquer forma, por carteira.",
      "Em carteira de terceiros, mostra os honorários da MC CRED e o repasse ao credor.",
      "Exportar planilha baixa o livro-caixa do período para abrir no Excel.",
    ],
  },
  {
    titulo: "Números de WhatsApp",
    itens: [
      "Os números da MC CRED são conectados por QR em Configurações → Linhas WhatsApp.",
      "Número conectado por QR precisa de ritmo baixo: cada um conversa com poucas pessoas novas por dia, para o WhatsApp não bloquear.",
      "Use um número por aparelho e não reconecte um número bloqueado para continuar mandando.",
    ],
  },
  {
    titulo: "O que a IA faz e o que não faz",
    itens: [
      "Faz: lê a mensagem da pessoa, entende datas (\"dia 10\", \"sexta\", \"quando receber\"), classifica (quer pagar, pediu prazo, desconfiou, já pagou, não quer) e escreve um rascunho de resposta.",
      "Não faz: não envia nada sozinha, não inventa desconto nem valor (o valor vem da proposta da carteira) e não fecha acordo.",
      "Quando a pessoa diz \"não\" ou pede para parar, o número é bloqueado para sempre, em todos os números da MC CRED.",
    ],
  },
  {
    titulo: "Regras de cobrança que o sistema segue",
    itens: [
      "Nada de ameaça, de constrangimento nem de falar da dívida com outra pessoa (Código de Defesa do Consumidor, art. 42).",
      "As dívidas antigas podem estar prescritas: o pagamento é voluntário e isso se fala com honestidade se a pessoa perguntar.",
      "Abordagem nova só de segunda a sexta, das 8h às 20h. Responder quem escreveu pode a qualquer hora.",
    ],
  },
];

export function Ajuda() {
  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
      {SECOES.map((s) => (
        <section key={s.titulo} aria-labelledby={`aj-${s.titulo}`}>
          <h2 id={`aj-${s.titulo}`} className="font-display text-titulo font-600 text-ouro">{s.titulo}</h2>
          <ul className="mt-2 space-y-2 text-[0.9375rem] leading-6">
            {s.itens.map((i) => (
              <li key={i} className="grid grid-cols-[12px_minmax(0,1fr)] gap-2">
                <span className="mt-[0.6rem] h-1.5 w-1.5 rounded-full bg-tinta" aria-hidden="true" />
                <span className="max-w-[68ch]">{i}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
