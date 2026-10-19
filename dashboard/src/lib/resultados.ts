// Resultados de contato e o próximo passo automático — a tabela do MC COB V5 ("FECHAR ATENDIMENTO"),
// com os mesmos nomes que o Maurelio usa. Quando não se informa data, o retorno vai para o próximo dia
// útil, como no sistema antigo.
import { proximoDiaUtil, somarDias, instanteSP, partesSP } from "@/lib/datas";

export type Resultado =
  | "sem_resposta" | "falou_com_titular" | "falou_com_terceiro" | "numero_errado" | "promessa" | "acordo"
  | "pagou" | "ja_pagou" | "pediu_retorno" | "recusou" | "contestou" | "nao_perturbe" | "falecido" | "anotacao";

export type Canal = "whatsapp" | "ligacao" | "presencial" | "email" | "sistema" | "robo";

export const CANAIS: { valor: Canal; rotulo: string }[] = [
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "ligacao", rotulo: "Ligação" },
  { valor: "presencial", rotulo: "Na loja" },
  { valor: "email", rotulo: "E-mail" },
];

type Def = { rotulo: string; tom: "neutro" | "bom" | "atencao" | "ruim"; proximo?: { dias: number; hora: number; tipo: "retorno" | "promessa" } | "pede_data" };

export const RESULTADOS: Record<Resultado, Def> = {
  falou_com_titular: { rotulo: "Falou com o titular", tom: "bom", proximo: { dias: 1, hora: 10, tipo: "retorno" } },
  promessa: { rotulo: "Prometeu pagar", tom: "bom", proximo: "pede_data" },
  acordo: { rotulo: "Acordo fechado", tom: "bom" },
  pagou: { rotulo: "Pagou", tom: "bom" },
  pediu_retorno: { rotulo: "Pediu retorno", tom: "neutro", proximo: "pede_data" },
  sem_resposta: { rotulo: "Não respondeu", tom: "neutro", proximo: { dias: 1, hora: 10, tipo: "retorno" } },
  falou_com_terceiro: { rotulo: "Falou com outra pessoa", tom: "neutro", proximo: { dias: 1, hora: 10, tipo: "retorno" } },
  ja_pagou: { rotulo: "Diz que já pagou", tom: "atencao", proximo: { dias: 1, hora: 9, tipo: "retorno" } },
  contestou: { rotulo: "Contestou a dívida", tom: "atencao", proximo: { dias: 1, hora: 10, tipo: "retorno" } },
  recusou: { rotulo: "Recusou negociar", tom: "ruim", proximo: { dias: 7, hora: 10, tipo: "retorno" } },
  numero_errado: { rotulo: "Número errado", tom: "ruim" },
  nao_perturbe: { rotulo: "Pediu para não ser contatado", tom: "ruim" },
  falecido: { rotulo: "Titular falecido", tom: "ruim" },
  anotacao: { rotulo: "Só anotação", tom: "neutro" },
};

// Os que aparecem como botões rápidos em "Registrar resultado", na ordem de uso.
export const RESULTADOS_RAPIDOS: Resultado[] = [
  "sem_resposta", "falou_com_titular", "promessa", "pediu_retorno", "recusou", "ja_pagou", "contestou",
  "falou_com_terceiro", "numero_errado", "nao_perturbe",
];

// Data sugerida para o próximo passo de um resultado (null = não agenda nada).
export function proximoPasso(r: Resultado, agora = new Date()): { quando: Date; tipo: "retorno" | "promessa" } | null {
  const p = RESULTADOS[r].proximo;
  if (!p) return null;
  if (p === "pede_data") {
    // sugestão para quem não digitou a data: amanhã às 10h (o operador corrige)
    const d = somarDias(agora, 1); const x = partesSP(d);
    return { quando: instanteSP(x.ano, x.mes, x.dia, 10, 0), tipo: r === "promessa" ? "promessa" : "retorno" };
  }
  return { quando: proximoDiaUtil(agora, p.hora, p.dias), tipo: p.tipo };
}

export const ROTULO_SITUACAO: Record<string, string> = {
  pendente: "Nunca acionado",
  na_fila: "Na fila do robô",
  contatado: "Contatado",
  em_negociacao: "Em negociação",
  pix_gerado: "Pix gerado",
  pago: "Pago",
  recusado: "Recusou",
  sem_whatsapp: "Sem WhatsApp",
  nao_perturbe: "Não perturbe",
  contestado: "Contestou",
  arquivado: "Arquivado",
};

// Situação escrita a lápis, como na caderneta: cor só para o que exige ação ou fecha a conta
// (vermelho de quem pediu para parar ou recusou, verde de pago). Nada de selo colorido em toda linha.
export const COR_SITUACAO: Record<string, string> = {
  pago: "text-pago", nao_perturbe: "text-margem", recusado: "text-margem",
};
export const corSituacao = (s: string) => COR_SITUACAO[s] ?? "text-lapis";

export const TOM_SITUACAO: Record<string, "neutral" | "green" | "amber" | "rose" | "blue"> = {
  pendente: "neutral",
  na_fila: "neutral",
  contatado: "blue",
  em_negociacao: "blue",
  pix_gerado: "amber",
  pago: "green",
  recusado: "rose",
  sem_whatsapp: "neutral",
  nao_perturbe: "rose",
  contestado: "amber",
  arquivado: "neutral",
};
