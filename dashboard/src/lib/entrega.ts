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
 * A CARÊNCIA. Com o aparelho da pessoa ligado, a entrega é confirmada em poucos segundos; 60s é
 * folga para não acusar uma mensagem que ainda está no ar. Passado isso, um `1` quer dizer "ainda
 * não chegou", não "não vai chegar".
 *
 * Em 09/09/2026 esta regra foi escrita sobre uma medição errada: "toda confirmação chega em 2 a 3
 * segundos, 12 de 12". Só que o banco só registrava os recibos desse intervalo. O `message_updated`
 * do Chatwoot vem sem status e era descartado (ver `chatwoot-sync`), então entrega tardia nunca
 * aparecia. Em 16/09 o Chatwoot tinha como entregues 50 mensagens que o banco dava como `1`,
 * inclusive abordagens que o operador via chegar no celular do chip.
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
      "O servidor do WhatsApp aceitou, mas o aparelho da pessoa ainda não confirmou o recebimento. " +
      "Pode ser aparelho desligado (entrega quando voltar) ou um número que não recebe. " +
      "Sem confirmação em 24h, o robô tenta o próximo número.",
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

/**
 * Duas linhas de `mensagens` são a MESMA saída quando têm o mesmo texto e nasceram dentro desta
 * janela. Ver `reciboMaisInformativo`: é a largura da gêmea, não da carência.
 */
export const JANELA_MESMA_SAIDA_MS = 60_000;

/**
 * O recibo de uma saída que está gravada em DUAS linhas — qual dos dois vale.
 *
 * POR QUE PRECISA EXISTIR. Uma abordagem é escrita por dois caminhos independentes: o
 * `campanha-registrar` (para a mensagem aparecer no painel mesmo se o webhook se perder) e o
 * `chatwoot-sync` (que traz o `chatwoot_message_id` e, com ele, o recibo). Os dois começam no mesmo
 * instante — a mensagem sair — e cada um faz "procura, senão insere". Quando a busca de um roda
 * antes do insert do outro, sobram duas linhas da mesma mensagem, e a do `campanha-registrar` vem
 * SEM recibo. Como ela costuma ser a mais recente das duas, a lista lia justamente ela e o selo
 * âmbar de "não confirmado" desaparecia: em 16/09/2026 a abordagem à DENIFIA aparecia limpa no
 * painel enquanto a linha gêmea dizia `1` — aceita pelo WhatsApp e nunca entregue.
 *
 * A precedência é a mesma de `deveGravarEntrega` (`supabase/functions/_shared/entrega.ts`, a fonte
 * da regra): ausência de recibo perde de qualquer recibo; falha vence "enviado"; só entrega
 * CONFIRMADA vence falha.
 */
export function reciboMaisInformativo(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  const x = a ?? null;
  const y = b ?? null;
  if (x === null) return y;
  if (y === null) return x;
  if (x === 0 || y === 0) {
    const melhor = Math.max(x, y);
    return melhor >= 2 ? melhor : 0;
  }
  return Math.max(x, y);
}

/** A última saída da conversa merece aviso na lista? Cobre recusa E falta de confirmação. */
export function saidaPreocupante(
  status: number | null | undefined,
  criadoEm: string | Date,
  agoraMs: number = Date.now(),
): boolean {
  return rotuloEntrega(status, criadoEm, agoraMs)?.alerta === true;
}
