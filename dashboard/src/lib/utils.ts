import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Os tamanhos de texto do MC COB (text-meta, text-sm2…) são tamanhos, não cores. Sem avisar, o
// tailwind-merge achava que "text-corpo" brigava com "text-white" e jogava fora a cor do botão.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["meta", "sm2", "corpo", "titulo", "pagina"] }],
      "font-weight": [{ font: ["500", "600", "700", "800"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const brl = (v: number | null | undefined) =>
  (Number(v ?? 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const num = (v: number | null | undefined) =>
  (Number(v ?? 0)).toLocaleString("pt-BR");

export const pct = (v: number | null | undefined, casas = 1) =>
  `${(Number(v ?? 0)).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

// "1 ativo", "2 ativos", "0 ativos": o número com a palavra no singular só quando é um.
export const contar = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;

// "53,85%", "60%": percentual sem casas inúteis, no formato brasileiro.
export const porcento = (v: number | null | undefined) =>
  `${(Number(v ?? 0)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

export const dataHoraBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
