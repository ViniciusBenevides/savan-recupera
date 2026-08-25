/**
 * Os três baldes: como um devedor já contatado pela conta banida é tratado agora.
 *
 * O contexto (§38): havia 438 conversas em andamento e 3 escaladas quando a WABA foi banida. Essa
 * gente já recebeu mensagem de um número que hoje está morto. Chegar de novo, por outro número,
 * falando do mesmo assunto, é continuidade legítima para uns e segunda abordagem não solicitada
 * para outros — e a segunda abordagem não solicitada é justamente o gatilho de denúncia que
 * derrubou a conta.
 */

export type Balde = "recontato_continuidade" | "primeira_vez" | "nunca_mais";

export type SinaisDevedor = {
  /** Chegou a mandar qualquer mensagem de entrada, em qualquer conversa, por qualquer chip. */
  respondeu: boolean;
  /** Tem linha em `bloqueios_contato` — pediu para parar, reclamou ou denunciou. */
  bloqueado: boolean;
  /** Já recebeu alguma abordagem antes. */
  jaAbordado: boolean;
};

/**
 * Em que balde este devedor está.
 *
 * A ordem das checagens é a regra de negócio, não estilo: **bloqueio vence tudo**. Alguém que
 * respondeu e depois pediu para parar é `nunca_mais`, não `recontato_continuidade` — o "não" é
 * mais recente e mais forte que qualquer engajamento anterior.
 */
export function classificarBalde(sinais: SinaisDevedor): Balde {
  if (sinais.bloqueado) return "nunca_mais";
  if (sinais.respondeu) return "recontato_continuidade";
  return "primeira_vez";
}

/**
 * O balde libera abordagem?
 *
 * `primeira_vez` inclui tanto quem nunca foi contatado quanto quem foi e ignorou. Os dois recebem
 * o opt-in novo sem qualquer menção ao contato anterior: para quem ignorou, citar a tentativa
 * passada só informa que a empresa insiste. `recontato_continuidade` também aborda, mas com o
 * anúncio de troca de número — ver `deveAnunciarTroca` em `dossie.ts`.
 */
export function podeAbordar(balde: Balde): boolean {
  return balde !== "nunca_mais";
}
