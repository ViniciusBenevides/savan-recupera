// Datas sempre no fuso de São Paulo (a operação é toda em Goiás/Brasília), seja no servidor (UTC na
// Vercel) ou no navegador. O MC COB V5 misturava UTC e horário local e errava "hoje"; aqui não.
export const TZ = "America/Sao_Paulo";

type Partes = { ano: number; mes: number; dia: number; hora: number; minuto: number; semana: number };

const fmtPartes = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  weekday: "short", hourCycle: "h23",
});
const SEMANA_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function partesSP(d: Date = new Date()): Partes {
  const p: Record<string, string> = {};
  for (const x of fmtPartes.formatToParts(d)) p[x.type] = x.value;
  return {
    ano: Number(p.year), mes: Number(p.month), dia: Number(p.day),
    hora: Number(p.hour) % 24, minuto: Number(p.minute), semana: SEMANA_EN.indexOf(p.weekday),
  };
}

// Converte "data/hora de parede em São Paulo" para o instante UTC correspondente.
export function instanteSP(ano: number, mes: number, dia: number, hora = 0, minuto = 0): Date {
  const palpite = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto));
  const p = partesSP(palpite);
  const comoSP = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
  return new Date(palpite.getTime() - (comoSP - palpite.getTime()));
}

export function inicioDoDiaSP(d: Date = new Date()): Date {
  const p = partesSP(d);
  return instanteSP(p.ano, p.mes, p.dia, 0, 0);
}
export function fimDoDiaSP(d: Date = new Date()): Date {
  return new Date(inicioDoDiaSP(d).getTime() + 86_400_000 - 1);
}
export function somarDias(d: Date, n: number): Date {
  const p = partesSP(d);
  return instanteSP(p.ano, p.mes, p.dia + n, p.hora, p.minuto);
}
// "2026-10-16" do dia em São Paulo
export function diaISO(d: Date = new Date()): string {
  const p = partesSP(d);
  return `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}
// Uma coluna `date` do banco ("2026-10-16") como meio-dia em São Paulo, para não virar o dia anterior.
export function deDiaISO(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return instanteSP(a, m, d, 12, 0);
}
export function mesmoDia(a: Date, b: Date) {
  return diaISO(a) === diaISO(b);
}
export function diasEntre(de: Date, ate: Date) {
  return Math.round((inicioDoDiaSP(ate).getTime() - inicioDoDiaSP(de).getTime()) / 86_400_000);
}
// Próximo dia útil (pula sábado e domingo), a uma hora fixa — a regra do MC COB.
export function proximoDiaUtil(base: Date, hora = 10, apartirDe = 1): Date {
  let d = somarDias(inicioDoDiaSP(base), apartirDe);
  while ([0, 6].includes(partesSP(d).semana)) d = somarDias(d, 1);
  const p = partesSP(d);
  return instanteSP(p.ano, p.mes, p.dia, hora, 0);
}

const SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function porExtenso(d: Date = new Date()) {
  const p = partesSP(d);
  const s = SEMANA[p.semana];
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}, ${p.dia} de ${MESES[p.mes - 1]}`;
}
export function nomeDoDia(d: Date) {
  return SEMANA[partesSP(d).semana];
}
export function hora(d: Date | string) {
  const p = partesSP(typeof d === "string" ? new Date(d) : d);
  return `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
}
export function dataCurta(d: Date | string) {
  const x = typeof d === "string" ? (d.length === 10 ? deDiaISO(d) : new Date(d)) : d;
  const p = partesSP(x);
  return `${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}`;
}
export function dataLonga(d: Date | string) {
  const x = typeof d === "string" ? (d.length === 10 ? deDiaISO(d) : new Date(d)) : d;
  const p = partesSP(x);
  return `${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}/${p.ano}`;
}

// Margem da caderneta: hora se for hoje, "ontem", ou a data curta.
export function margem(d: Date | string, agora = new Date()) {
  const x = typeof d === "string" ? (d.length === 10 ? deDiaISO(d) : new Date(d)) : d;
  const delta = diasEntre(x, agora);
  if (delta === 0) return hora(x);
  if (delta === 1) return "ontem";
  if (delta === -1) return "amanhã";
  return dataCurta(x);
}

// "há 18 min", "há 3 h", "há 2 dias"
export function ha(d: Date | string, agora = new Date()) {
  const x = typeof d === "string" ? new Date(d) : d;
  const min = Math.max(0, Math.round((agora.getTime() - x.getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const dd = Math.round(h / 24);
  return dd === 1 ? "há 1 dia" : `há ${dd} dias`;
}

// "daqui a 25 dias", "hoje", "amanhã", "venceu há 3 dias"
export function prazo(d: Date | string, agora = new Date()) {
  const x = typeof d === "string" ? (d.length === 10 ? deDiaISO(d) : new Date(d)) : d;
  const n = diasEntre(agora, x);
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  if (n > 1) return `daqui a ${n} dias`;
  return `há ${-n} dias`;
}
