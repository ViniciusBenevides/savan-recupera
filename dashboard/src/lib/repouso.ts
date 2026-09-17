// Repouso do chip: período escolhido pelo operador sem abordagem nenhuma (§43 do contexto).
// Enquanto `chips.repouso_ate` estiver no futuro, o chip não pode ser ativado — o gatilho do banco
// garante. Só apresentação e contas de tempo aqui.

import { formatarFimBloqueio } from "@/lib/bloqueio-whatsapp";

export const DIAS_REPOUSO_PADRAO = 14;
export const DIAS_REPOUSO_MAX = 60;

export function emRepouso(ate: string | null | undefined, agora: Date = new Date()): boolean {
  if (!ate) return false;
  const t = Date.parse(ate);
  return !Number.isNaN(t) && t > agora.getTime();
}

/** "13 dias e 4 h", "5 h e 12 min", "8 min" — o que falta até `ate`. */
export function tempoRestante(ate: string | null | undefined, agora: Date = new Date()): string {
  if (!ate) return "";
  const ms = Date.parse(ate) - agora.getTime();
  if (Number.isNaN(ms) || ms <= 0) return "";
  const min = Math.floor(ms / 60_000);
  const dias = Math.floor(min / 1440);
  const horas = Math.floor((min % 1440) / 60);
  const minutos = min % 60;
  if (dias > 0) return horas > 0 ? `${dias} ${dias === 1 ? "dia" : "dias"} e ${horas} h` : `${dias} ${dias === 1 ? "dia" : "dias"}`;
  if (horas > 0) return minutos > 0 ? `${horas} h e ${minutos} min` : `${horas} h`;
  return `${Math.max(1, minutos)} min`;
}

/** Fração já cumprida do repouso, de 0 a 1 — a barra do contador. */
export function progressoRepouso(desde: string | null | undefined, ate: string | null | undefined, agora: Date = new Date()): number {
  const fim = ate ? Date.parse(ate) : NaN;
  const ini = desde ? Date.parse(desde) : NaN;
  if (Number.isNaN(fim) || Number.isNaN(ini) || fim <= ini) return 0;
  return Math.min(1, Math.max(0, (agora.getTime() - ini) / (fim - ini)));
}

export function mensagemRepouso(ate: string | null | undefined): string {
  const quando = formatarFimBloqueio(ate);
  const falta = tempoRestante(ate);
  return `Este chip está em repouso${quando ? ` até ${quando}` : ""}${falta ? ` (faltam ${falta})` : ""}. ` +
    "Para ativar antes disso, encerre o repouso no menu do chip.";
}
