/**
 * Número sem WhatsApp não gasta a vaga do chip (22/09/2026).
 *
 * O `campanha-lote` reserva o próximo horário do chip (`chips.proximo_disparo_em`) ANTES de o W01
 * chamar o `contato-criar`. Desde o §44 o `contato-criar` pergunta ao WhatsApp se o número existe,
 * e quando não existe nada sai para ninguém — mas a reserva ficava de pé. Num chip de 1/h, dois
 * números sem WhatsApp seguidos viraram 3h sem mensagem nenhuma (chip 1, 13:37 → 16:56).
 *
 * Aqui a vaga volta: a próxima tentativa sai em 5–10 min sorteados, em vez de esperar a hora cheia.
 *
 * O que continua igual, de propósito:
 * - uma consulta `on_whatsapp` por devedor, na hora da primeira mensagem, nunca em lote (§44). A
 *   espera sorteada é o que mantém isso: sem ela a retomada viraria varredura.
 * - no máximo `MAX_RETOMADAS_HORA` retomadas por chip numa hora. Depois disso o chip volta ao ritmo
 *   normal: uma carteira cheia de número morto não pode virar sondagem de USync, que o WhatsApp
 *   limita e lê como robô (guia do Baileys, §8). Na dúvida, fica o ritmo lento.
 * - só ENCURTA a reserva, nunca a estica. Com ritmo rápido (reserva menor que 5 min) nada muda.
 *
 * Por que encurtar não atropela um lote em andamento: o `campanha-lote` só monta lote com mais de
 * um item quando `porHorizonte * intMax` cabe em 1 min, ou seja, a reserva do lote inteiro fica
 * abaixo dos 5 min mínimos daqui — o `.gt` do update nunca a alcança.
 */

export const RETOMADA_MIN_S = 5 * 60;
export const RETOMADA_MAX_S = 10 * 60;
export const MAX_RETOMADAS_HORA = 3;

/**
 * Novo `proximo_disparo_em` depois de um "sem WhatsApp", ou `null` para não mexer.
 *
 * `semWhatsappNaHora` conta os "sem WhatsApp" deste chip nos últimos 60 min INCLUINDO o atual.
 * `sorteio` devolve um número em [0, 1) — `Math.random` em produção, fixo nos testes.
 */
export function retomadaAposSemWhatsapp(opts: {
  proximoDisparoEm: string | null;
  agoraMs: number;
  semWhatsappNaHora: number;
  sorteio?: () => number;
}): string | null {
  if (!(opts.semWhatsappNaHora <= MAX_RETOMADAS_HORA)) return null;

  const reservadoMs = opts.proximoDisparoEm ? new Date(opts.proximoDisparoEm).getTime() : NaN;
  // Sem reserva de pé o chip já está livre: não há vaga para devolver.
  if (!Number.isFinite(reservadoMs) || reservadoMs <= opts.agoraMs) return null;

  const r = Math.min(Math.max((opts.sorteio ?? Math.random)(), 0), 0.999999);
  const esperaS = RETOMADA_MIN_S + Math.floor(r * (RETOMADA_MAX_S - RETOMADA_MIN_S + 1));
  const novoMs = opts.agoraMs + esperaS * 1000;
  if (novoMs >= reservadoMs) return null;
  return new Date(novoMs).toISOString();
}
