export type DetalhesPisoProposta = {
  valorCalculadoComDesconto: number;
  valorMinimoQuitacao: number;
  pisoMinimoAplicado: boolean;
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
  const explicacao = pisoAplicado
    ? `A faixa prevê ${desconto}% de desconto, mas o valor calculado cairia para ${brl(calculado)}, abaixo do mínimo que recebemos para quitação, que é ${brl(minimo)}. Por isso, a quitação fica em ${brl(final)} para encerrar definitivamente a conta.`
    : null;
  return {
    valorCalculadoComDesconto: calculado,
    valorMinimoQuitacao: minimo,
    pisoMinimoAplicado: pisoAplicado,
    descontoEfetivoPct: descontoEfetivo,
    explicacaoObrigatoria: explicacao,
  };
}

export function garantirExplicacaoPiso(
  resposta: string,
  detalhes: DetalhesPisoProposta,
): string {
  const texto = String(resposta ?? "").trim();
  if (!detalhes.pisoMinimoAplicado || !detalhes.explicacaoObrigatoria) return texto;
  const normal = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\bminim[oa]\b/.test(normal)) return texto;
  return `${texto}\n\n${detalhes.explicacaoObrigatoria}`.trim();
}
