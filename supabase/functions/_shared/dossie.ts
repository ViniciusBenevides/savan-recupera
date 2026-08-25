/**
 * O dossiê do devedor: tudo que já foi dito a ele, por qualquer chip, em qualquer época, em ordem.
 *
 * Esta é a peça central do ADR-0001. O Chatwoot não move thread entre inboxes, e a integração da
 * Evolution cria uma inbox por número — então, do ponto de vista do Chatwoot, um devedor abordado
 * por três chips ao longo de um ano tem três conversas separadas e nenhuma completa.
 *
 * Aqui elas viram uma. É o que o robô lê antes de escrever, e é o que impede um número novo de
 * repetir o que o número antigo já disse — a falha que, nas conversas reais, fez pessoas acusarem
 * o atendimento de golpe.
 */

export type MensagemDossie = {
  conversa_id: number;
  chip_id: number | null;
  direcao: "entrada" | "saida";
  conteudo: string | null;
  criado_em: string;
};

export type LinhaDossie = MensagemDossie & {
  /** Primeira mensagem depois de o transporte mudar de chip. Útil para a IA saber onde houve corte. */
  trocou_de_chip: boolean;
};

/**
 * Ordena cronologicamente, descarta o que não é conteúdo e marca onde o chip mudou.
 *
 * Mensagem vazia é descartada de propósito: figurinha, áudio não transcrito e mensagem apagada
 * chegam com conteúdo nulo ou em branco, e virariam linha muda no histórico que o modelo lê.
 */
export function montarDossie(mensagens: MensagemDossie[]): LinhaDossie[] {
  const uteis = mensagens
    .filter((m) => typeof m.conteudo === "string" && m.conteudo.trim() !== "")
    .slice()
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));

  let chipAnterior: number | null | undefined = undefined;
  return uteis.map((m) => {
    const trocou = chipAnterior !== undefined && m.chip_id !== chipAnterior;
    chipAnterior = m.chip_id;
    return { ...m, trocou_de_chip: trocou };
  });
}

/**
 * A pessoa chegou a responder alguma coisa?
 *
 * Só mensagem de entrada conta. Nossa própria abordagem e nossos follow-ups são monólogo — e
 * monólogo não é relacionamento a preservar.
 */
export function conversaEstavaViva(mensagens: MensagemDossie[]): boolean {
  return mensagens.some(
    (m) => m.direcao === "entrada" && typeof m.conteudo === "string" && m.conteudo.trim() !== "",
  );
}

/**
 * O chip novo deve anunciar que mudou de número? (decisão do Q10)
 *
 * Sim **só** quando a conversa estava viva. O raciocínio:
 *
 * - Se a pessoa já tinha respondido, um número desconhecido retomando o assunto sem explicação é
 *   exatamente o que cheira a golpe — e foi o que derrubou a conta oficial (§38). Anunciar é o que
 *   mantém a confiança já conquistada.
 * - Se ela nunca respondeu, não há relação a retomar. Citar um contato anterior que ela ignorou só
 *   informa que a empresa insiste — e vira a segunda abordagem não solicitada, que é o gatilho de
 *   denúncia. Ela é abordada como primeira vez.
 */
export function deveAnunciarTroca(mensagens: MensagemDossie[], chipNovoId: number): boolean {
  if (!conversaEstavaViva(mensagens)) return false;

  const chipsUsados = new Set(
    mensagens.map((m) => m.chip_id).filter((c): c is number => typeof c === "number"),
  );
  if (chipsUsados.size === 0) return false;

  // Se o chip novo já falava com essa pessoa, não houve troca do ponto de vista dela.
  return !chipsUsados.has(chipNovoId);
}
