export type DetalhesPisoProposta = {
  valorCalculadoComDesconto: number;
  valorMinimoQuitacao: number;
  pisoMinimoAplicado: boolean;
  /** Valor original já está no piso ou abaixo dele: não há desconto a aplicar. */
  semDescontoPossivel: boolean;
  descontoEfetivoPct: number;
  explicacaoObrigatoria: string | null;
};

const arredondarCentavos = (valor: number) => Math.round(valor * 100) / 100;
const brl = (valor: number) => valor.toLocaleString("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

export function detalharPisoProposta(
  proposta: Record<string, unknown> | null | undefined,
  valorMinimo: number,
): DetalhesPisoProposta {
  const original = Number(proposta?.valor_original ?? 0);
  const desconto = Number(proposta?.desconto_pct ?? 0);
  const final = Number(proposta?.valor_final ?? 0);
  const minimo = Number.isFinite(valorMinimo) && valorMinimo > 0 ? valorMinimo : 30;
  const calculado = arredondarCentavos(original * (1 - desconto / 100));
  const pisoAplicado = original >= minimo
    && calculado < minimo
    && Math.abs(final - minimo) < 0.01;
  const descontoEfetivo = original > 0
    ? arredondarCentavos((1 - final / original) * 100)
    : 0;
  // Quando o valor original ja e menor ou igual ao minimo de quitacao, nao existe desconto
  // possivel: valor_final == valor_original. Sem esta flag o modelo anunciava "60% de desconto,
  // fica R$ 18,90" para um valor original de R$ 18,90 — a contradicao que mais corroeu a
  // credibilidade nas conversas reais.
  const semDesconto = original > 0
    && original <= minimo
    && Math.abs(final - original) < 0.01;
  const explicacao = pisoAplicado
    ? `A faixa prevê ${desconto}% de desconto, mas o valor calculado cairia para ${brl(calculado)}, abaixo do mínimo que recebemos para quitação, que é ${brl(minimo)}. Por isso, a quitação fica em ${brl(final)} para encerrar definitivamente a conta.`
    : semDesconto
    ? `O valor registrado (${brl(original)}) já está no piso de quitação, então não há desconto a aplicar: a quitação é pelo próprio valor, e o que a proposta oferece é o encerramento definitivo com termo de quitação.`
    : null;
  return {
    valorCalculadoComDesconto: calculado,
    valorMinimoQuitacao: minimo,
    pisoMinimoAplicado: pisoAplicado,
    semDescontoPossivel: semDesconto,
    descontoEfetivoPct: descontoEfetivo,
    explicacaoObrigatoria: explicacao,
  };
}

export function garantirExplicacaoPiso(
  resposta: string,
  detalhes: DetalhesPisoProposta,
): string {
  const texto = String(resposta ?? "").trim();
  if (!detalhes.explicacaoObrigatoria) return texto;
  const normal = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (detalhes.pisoMinimoAplicado) {
    if (/\bminim[oa]\b/.test(normal)) return texto;
    return `${texto}\n\n${detalhes.explicacaoObrigatoria}`.trim();
  }
  if (detalhes.semDescontoPossivel) {
    // So corrige quando o texto realmente anunciou um desconto que nao existe.
    const anunciouDesconto = /\bdesconto\b|\d+\s*%|\bcondicao\s+especial\b/.test(normal);
    if (!anunciouDesconto) return texto;
    return `${texto}\n\n${detalhes.explicacaoObrigatoria}`.trim();
  }
  return texto;
}
