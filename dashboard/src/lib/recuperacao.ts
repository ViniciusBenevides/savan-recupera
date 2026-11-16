// Regras da Central de recuperação e da tela de Atraso / prescrição (MC COB V5.7.03 e V5.7.16).
// Só conta e classifica: nada aqui grava, e nada aqui decide se uma dívida está prescrita.
import { diaISO, diasEntre } from "@/lib/datas";

// ---------- Promessas: vencida, hoje, amanhã ou mais para frente ----------
export type QuandoPromessa = "vencida" | "hoje" | "amanha" | "futura";

export function quandoPromessa(quando: string, agora = new Date()): QuandoPromessa {
  const n = diasEntre(agora, new Date(quando));
  if (n < 0) return "vencida";
  if (n === 0) return "hoje";
  if (n === 1) return "amanha";
  return "futura";
}

// ---------- Faixas de atraso (anos completos desde o vencimento) ----------
export type Faixa = "lt1" | "1a2" | "2a3" | "3a4" | "4a5" | "5mais" | "sem";

export const FAIXAS: { k: Faixa; t: string; curto: string }[] = [
  { k: "lt1", t: "Menos de 1 ano", curto: "Menos de 1 ano" },
  { k: "1a2", t: "1 a 2 anos", curto: "1 a 2 anos" },
  { k: "2a3", t: "2 a 3 anos", curto: "2 a 3 anos" },
  { k: "3a4", t: "3 a 4 anos", curto: "3 a 4 anos" },
  { k: "4a5", t: "4 a 5 anos", curto: "4 a 5 anos" },
  { k: "5mais", t: "5 anos ou mais", curto: "5 anos ou mais" },
  { k: "sem", t: "Sem vencimento", curto: "Sem data" },
];

// "2026-11-10" menos n anos, no calendário (29/02 vira 28/02 em ano comum)
export function anosAtras(hojeISO: string, n: number): string {
  const [a, m, d] = hojeISO.split("-").map(Number);
  const ano = a - n;
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return `${ano}-${String(m).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/**
 * Limites de vencimento de uma faixa: `de` é exclusivo e `ate` é inclusivo, os dois em "aaaa-mm-dd".
 * Quem venceu há exatamente 5 anos já está em "5 anos ou mais"; quem ainda não venceu fica em
 * "menos de 1 ano" com zero dia de atraso.
 */
export function limitesDaFaixa(faixa: Faixa, hoje = new Date()): { de: string | null; ate: string | null; semData: boolean } {
  const h = diaISO(hoje);
  const corte = (n: number) => anosAtras(h, n);
  switch (faixa) {
    case "lt1": return { de: corte(1), ate: null, semData: false };
    case "1a2": return { de: corte(2), ate: corte(1), semData: false };
    case "2a3": return { de: corte(3), ate: corte(2), semData: false };
    case "3a4": return { de: corte(4), ate: corte(3), semData: false };
    case "4a5": return { de: corte(5), ate: corte(4), semData: false };
    case "5mais": return { de: null, ate: corte(5), semData: false };
    case "sem": return { de: null, ate: null, semData: true };
  }
}

export function faixaDoVencimento(vencimento: string | null, hoje = new Date()): Faixa {
  if (!vencimento) return "sem";
  const v = vencimento.slice(0, 10);
  for (const f of ["5mais", "4a5", "3a4", "2a3", "1a2"] as Faixa[]) {
    const { de, ate } = limitesDaFaixa(f, hoje);
    if ((de === null || v > de) && (ate === null || v <= ate)) return f;
  }
  return "lt1";
}

// "6 anos e 2 meses", "8 meses", "12 dias", "vence em 5 dias"
export function tempoEmAtraso(vencimento: string | null, hoje = new Date()): { texto: string; dias: number } {
  if (!vencimento) return { texto: "Sem vencimento", dias: 0 };
  const h = diaISO(hoje);
  const [a1, m1, d1] = vencimento.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = h.split("-").map(Number);
  const dias = Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
  if (dias < 0) return { texto: dias === -1 ? "Vence amanhã" : `Vence em ${-dias} dias`, dias: 0 };
  if (dias === 0) return { texto: "Vence hoje", dias: 0 };
  let meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (meses < 1) return { texto: dias === 1 ? "1 dia" : `${dias} dias`, dias };
  const anos = Math.floor(meses / 12);
  meses -= anos * 12;
  const partes = [anos ? `${anos} ${anos === 1 ? "ano" : "anos"}` : "", meses ? `${meses} ${meses === 1 ? "mês" : "meses"}` : ""].filter(Boolean);
  return { texto: partes.join(" e "), dias };
}

// A leitura da faixa para quem vai cobrar. É triagem: o prazo de verdade depende do título e de
// causas de suspensão ou interrupção, que só o Jurídico confere. Cor só onde há o que fazer agora
// (perto dos 5 anos, falta o vencimento, prescrição já conferida): numa carteira antiga quase tudo
// tem 5 anos ou mais, e pintar todas as linhas não ajudaria ninguém a achar nada.
export function triagem(faixa: Faixa, prescricaoConferida: string | null, hoje = new Date()): { texto: string; tom: "neutro" | "atencao" | "atraso" } {
  if (prescricaoConferida) {
    return prescricaoConferida <= diaISO(hoje)
      ? { texto: "Prescrição conferida pela equipe", tom: "atraso" }
      : { texto: "Dentro do prazo conferido", tom: "neutro" };
  }
  if (faixa === "5mais") return { texto: "5 anos ou mais, prazo não conferido", tom: "neutro" };
  if (faixa === "4a5") return { texto: "Perto dos 5 anos", tom: "atencao" };
  if (faixa === "sem") return { texto: "Falta o vencimento", tom: "atencao" };
  return { texto: "Dentro de 5 anos", tom: "neutro" };
}

// ---------- Fila da carteira: quem não dá para chamar por falta de contato ----------
export function semContatoUtil(motivos: Record<string, number> | null | undefined): number {
  return Object.entries(motivos ?? {}).reduce((s, [m, n]) => s + (m.startsWith("Higienizar contato") ? Number(n) : 0), 0);
}
