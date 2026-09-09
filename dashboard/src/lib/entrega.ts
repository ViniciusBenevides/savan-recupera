/**
 * Recibo de entrega, traduzido para o que o operador precisa ler na tela.
 *
 * A escala crua está em `mensagens.status_entrega` (migration 20260902120000) e a regra de
 * gravação em `supabase/functions/_shared/entrega.ts`:
 *   0 falhou · 1 enviado · 2 entregue · 3 lido · 4 reproduzido · null sem recibo
 *
 * POR QUE ESTE ARQUIVO EXISTE. O `1` era mostrado como "enviado", em cinza neutro, ao lado de
 * "entregue" — e "enviado" lê como sucesso. Só que `1` é o aceite do SERVIDOR do WhatsApp, não a
 * chegada no aparelho: numa conta restrita o WhatsApp aceita e descarta em silêncio (§31, §8 do
 * guia Baileys), e foi assim que o operador viu duas abordagens ao Gedilson marcadas como
 * "enviado" enquanto no celular dele não existia conversa nenhuma. A tela precisa separar
 * "aceitaram de nós" de "chegou nela".
 *
 * A CARÊNCIA. Medido em produção (09/09/2026), toda confirmação de entrega chegou entre 2 e 3
 * segundos do envio — 12 de 12, sem exceção. Então um `1` que persiste não está "a caminho": ou o
 * número não recebe, ou o aparelho da pessoa está desligado. 60s é folga de 20x sobre o observado,
 * o suficiente para nunca acusar uma mensagem que ainda está no ar.
 *
 * O texto diz "não confirmado", e não "não chegou", de propósito: entrega exige o aparelho do outro
 * lado ONLINE. Celular desligado também para em `1` e pode entregar horas depois — o `chatwoot-sync`
 * grava quando chegar. Afirmar "não chegou" seria trocar um erro por outro.
 */

/** Abaixo disso, um `1` ainda é razoavelmente "no ar". Ver a nota sobre a carência acima. */
export const CARENCIA_CONFIRMACAO_MS = 60_000;

export type ChaveEntrega = "falhou" | "em_transito" | "sem_confirmacao" | "entregue" | "lido" | "ouvido";

export type RotuloEntrega = { texto: string; classe: string; titulo: string; alerta: boolean };

export const ENTREGA: Record<ChaveEntrega, RotuloEntrega> = {
  falhou: {
    texto: "não entregue",
    classe: "text-rose",
    titulo: "O provedor recusou. Esta mensagem não chegou ao destinatário.",
    alerta: true,
  },
  em_transito: {
    texto: "enviando…",
    classe: "text-mist",
    titulo: "Saiu agora. A confirmação de entrega costuma chegar em poucos segundos.",
    alerta: false,
  },
  sem_confirmacao: {
    texto: "não confirmado",
    classe: "text-amber",
    titulo:
      "O servidor do WhatsApp aceitou, mas nenhuma confirmação de entrega chegou. " +
      "Em produção a confirmação vem em 2 a 3 segundos, então isto normalmente significa que a " +
      "mensagem não chegou — ou o número não recebe, ou o aparelho está desligado.",
    alerta: true,
  },
  entregue: { texto: "entregue", classe: "text-mist", titulo: "Entregue no aparelho.", alerta: false },
  lido: { texto: "lido", classe: "text-emerald-soft", titulo: "Lido pelo destinatário.", alerta: false },
  ouvido: {
    texto: "ouvido",
    classe: "text-emerald-soft",
    titulo: "Áudio reproduzido pelo destinatário.",
    alerta: false,
  },
};

/**
 * Traduz o recibo cru + a idade da mensagem para a chave de exibição.
 *
 * `null` continua devolvendo `null` (nada a mostrar): ausência de recibo é diferente de recibo
 * ruim, e são majoritariamente as mensagens do canal Meta, anteriores à coluna existir.
 */
export function chaveEntrega(
  status: number | null | undefined,
  criadoEm: string | Date,
  agoraMs: number = Date.now(),
): ChaveEntrega | null {
  if (status == null) return null;
  if (status === 0) return "falhou";
  if (status >= 4) return "ouvido";
  if (status === 3) return "lido";
  if (status === 2) return "entregue";

  const nascidoMs = new Date(criadoEm).getTime();
  // Data ilegível não vira acusação: sem saber a idade, fica no rótulo neutro.
  if (!Number.isFinite(nascidoMs)) return "em_transito";
  return agoraMs - nascidoMs < CARENCIA_CONFIRMACAO_MS ? "em_transito" : "sem_confirmacao";
}

/** O rótulo pronto, ou `null` quando não há recibo nenhum a mostrar. */
export function rotuloEntrega(
  status: number | null | undefined,
  criadoEm: string | Date,
  agoraMs: number = Date.now(),
): RotuloEntrega | null {
  const chave = chaveEntrega(status, criadoEm, agoraMs);
  return chave ? ENTREGA[chave] : null;
}

/** A última saída da conversa merece aviso na lista? Cobre recusa E falta de confirmação. */
export function saidaPreocupante(
  status: number | null | undefined,
  criadoEm: string | Date,
  agoraMs: number = Date.now(),
): boolean {
  return rotuloEntrega(status, criadoEm, agoraMs)?.alerta === true;
}
