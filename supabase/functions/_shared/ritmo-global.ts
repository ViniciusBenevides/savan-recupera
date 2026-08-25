/**
 * Freio global da operação — o botão de pânico.
 *
 * O ritmo continua sendo **por chip** (decisão do Q6): o WhatsApp avalia cada linha isoladamente,
 * e travar o total só desperdiça linha saudável. Isto aqui é outra coisa: um teto que soma todos
 * os chips, para o dono desacelerar dez números de uma vez quando as denúncias subirem, sem
 * precisar editar dez cadastros um por um.
 *
 * Desligado por padrão, de propósito. Um freio que vem ligado vira ruído e alguém o desliga sem
 * entender — aí ele não está lá quando precisa.
 */

export type FreioGlobal = { ativo: boolean; msgs_hora: number | null };

/**
 * Lê a config `freio_global`, tolerante a lixo.
 *
 * "Ativo com teto inválido" (ausente, zero, negativo, texto) resolve para **desligado**, nunca para
 * um teto que barra tudo. Um erro de digitação na tela de configuração não pode parar a operação
 * inteira em silêncio.
 */
export function lerFreioGlobal(valor: unknown): FreioGlobal {
  if (!valor || typeof valor !== "object") return { ativo: false, msgs_hora: null };

  const bruto = valor as { ativo?: unknown; msgs_hora?: unknown };
  const teto = typeof bruto.msgs_hora === "number" && Number.isFinite(bruto.msgs_hora)
    ? bruto.msgs_hora
    : null;

  // Desligado com teto configurado: preserva o número, para a tela lembrar do último valor.
  if (bruto.ativo !== true) return { ativo: false, msgs_hora: teto };

  if (teto === null || teto <= 0) return { ativo: false, msgs_hora: null };
  return { ativo: true, msgs_hora: teto };
}

/** Ainda cabe abordagem nesta hora, somando a operação inteira? */
export function avaliarFreioGlobal(
  freio: FreioGlobal,
  enviadasNaHora: number,
): { pode: boolean; restante: number | null } {
  if (!freio.ativo || freio.msgs_hora === null) return { pode: true, restante: null };

  const restante = Math.max(0, freio.msgs_hora - enviadasNaHora);
  return { pode: restante > 0, restante };
}
