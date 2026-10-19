// Conta do acordo — usada na tela (prévia) e no servidor (a que vale). O servidor nunca confia no
// número que veio do navegador: recalcula com esta mesma função e confere os limites da carteira.
// Dinheiro em centavos inteiros (o MC COB V5 usava float e errava centavo).
import { deDiaISO, diaISO, partesSP, instanteSP } from "@/lib/datas";

export type LimitesCarteira = {
  desconto_max_pct: number;
  parcelas_max: number;
  entrada_min_pct: number;
  parcela_min_valor: number;
};

export type PedidoAcordo = {
  valor_divida: number;      // saldo do devedor
  desconto_pct: number;      // 0–100
  parcelas: number;          // 1 = à vista
  entrada: number;           // R$ (0 = sem entrada)
  primeiro_vencimento: string; // "AAAA-MM-DD"
};

export type Parcela = { numero: number; vencimento: string; valor: number };

export type Simulacao = {
  valor_total: number;
  entrada: number;
  parcelas: Parcela[];
  valor_parcela: number;
  problemas: string[];        // bloqueiam a gravação
  precisa_liberacao: boolean; // desconto acima do limite da carteira
};

const cent = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;

function somarMesesISO(iso: string, n: number): string {
  const d = deDiaISO(iso);
  const p = partesSP(d);
  const alvoMes = p.mes - 1 + n;
  const ano = p.ano + Math.floor(alvoMes / 12);
  const mes = (alvoMes % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return diaISO(instanteSP(ano, mes, Math.min(p.dia, ultimo), 12, 0));
}

// O desconto que a pessoa recebe de verdade, em % com 2 casas. A fn_proposta sobe o valor até o
// mínimo do Pix e nunca passa da dívida: numa dívida de R$ 9,90 a faixa de 60% vira desconto nenhum.
export function descontoReal(divida: number, valor: number): number {
  const d = Number(divida), v = Number(valor);
  if (!(d > 0) || !(v >= 0) || v >= d) return 0;
  return Math.round((1 - v / d) * 10000) / 100;
}

export function simularAcordo(p: PedidoAcordo, lim: LimitesCarteira): Simulacao {
  const problemas: string[] = [];
  const divida = cent(p.valor_divida);
  const desconto = Math.max(0, Math.min(100, Number(p.desconto_pct) || 0));
  const qtd = Math.max(1, Math.floor(Number(p.parcelas) || 1));
  const total = Math.round(divida * (1 - desconto / 100));
  const entrada = Math.max(0, Math.min(total, cent(Number(p.entrada) || 0)));

  if (divida <= 0) problemas.push("Este devedor está sem saldo.");
  if (qtd > lim.parcelas_max) problemas.push(`A carteira aceita no máximo ${lim.parcelas_max} parcelas.`);
  if (lim.entrada_min_pct > 0 && qtd > 1 && entrada < Math.round(total * lim.entrada_min_pct / 100))
    problemas.push(`A entrada mínima desta carteira é ${lim.entrada_min_pct}% (${reais(Math.round(total * lim.entrada_min_pct / 100)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.primeiro_vencimento)) problemas.push("Informe a data do 1º pagamento.");

  // `parcelas` conta as parcelas DEPOIS da entrada, como no MC COB ("Entrada R$ + N parcelas").
  const restante = total - entrada;
  const parcelas: Parcela[] = [];
  const temEntrada = entrada > 0;
  let valorParcela = 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(p.primeiro_vencimento)) {
    if (temEntrada) parcelas.push({ numero: 0, vencimento: p.primeiro_vencimento, valor: reais(entrada) });
    const nParcelas = qtd;
    if (restante > 0) {
      const base = Math.floor(restante / nParcelas);
      const sobra = restante - base * nParcelas;
      for (let i = 1; i <= nParcelas; i++) {
        const valor = base + (i === nParcelas ? sobra : 0);
        parcelas.push({ numero: i, vencimento: somarMesesISO(p.primeiro_vencimento, temEntrada ? i : i - 1), valor: reais(valor) });
      }
      valorParcela = reais(base);
      if (reais(base) < lim.parcela_min_valor)
        problemas.push(`A parcela mínima desta carteira é ${lim.parcela_min_valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
    }
  }

  return {
    valor_total: reais(total),
    entrada: reais(entrada),
    parcelas,
    valor_parcela: valorParcela,
    problemas,
    precisa_liberacao: desconto > lim.desconto_max_pct,
  };
}
