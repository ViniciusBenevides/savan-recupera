// Feriados nacionais (base bancária/ANBIMA) — ESPELHA a lógica das Edge Functions
// campanha-lote/campanha-followup (supabase/functions). Mantenha as duas em sincronia.
// Aqui guardamos também o NOME do feriado, p/ exibir no calendário da tela de Campanha.

export type Feriado = { data: string; nome: string };

// "YYYY-MM-DD" -> nome do feriado. Fixos + móveis via Páscoa (Meeus/Jones/Butcher).
export function feriadosNacionais(ano: number): Map<string, string> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (y: number, mo: number, d: number) => `${y}-${pad(mo)}-${pad(d)}`;
  const m = new Map<string, string>([
    [iso(ano, 1, 1), "Confraternização Universal"],
    [iso(ano, 4, 21), "Tiradentes"],
    [iso(ano, 5, 1), "Dia do Trabalho"],
    [iso(ano, 9, 7), "Independência"],
    [iso(ano, 10, 12), "N. Sra. Aparecida"],
    [iso(ano, 11, 2), "Finados"],
    [iso(ano, 11, 15), "Proclamação da República"],
    [iso(ano, 11, 20), "Consciência Negra"],
    [iso(ano, 12, 25), "Natal"],
  ]);
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * mm + 114) / 31), dia = ((h + l - 7 * mm + 114) % 31) + 1;
  const pascoa = Date.UTC(ano, mes - 1, dia);
  const off = (o: number) => { const dt = new Date(pascoa + o * 86400000); return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); };
  m.set(off(-48), "Carnaval (segunda)");
  m.set(off(-47), "Carnaval (terça)");
  m.set(off(-2), "Sexta-feira Santa");
  m.set(off(60), "Corpus Christi");
  return m;
}

// Lista ordenada por data (p/ exibir "os feriados nacionais do ano").
export function listaFeriados(ano: number): Feriado[] {
  return [...feriadosNacionais(ano).entries()]
    .map(([data, nome]) => ({ data, nome }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

// "YYYY-MM-DD" no horário local (p/ casar com a grade do calendário, sem deslocar fuso).
export function isoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// DD/MM a partir de "YYYY-MM-DD".
export function diaMes(iso: string): string {
  const [, mo, d] = iso.split("-");
  return `${d}/${mo}`;
}

export type StatusDia = "envia" | "fora" | "feriado" | "feriado_extra";

// Mesma decisão do gate das Edge Functions, mas por data da grade (sem horário).
export function statusDoDia(iso: string, dow: number, janela: any, feriadosAno: Map<string, string>): StatusDia {
  const extras: string[] = Array.isArray(janela?.feriados_extra) ? janela.feriados_extra : [];
  if (extras.includes(iso)) return "feriado_extra";
  if (janela?.pular_feriados !== false && feriadosAno.has(iso)) return "feriado";
  const dias: number[] = janela?.dias ?? [1, 2, 3, 4, 5];
  if (!dias.includes(dow)) return "fora";
  return "envia";
}
