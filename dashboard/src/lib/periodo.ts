// Período de relatório no fuso de SP, a partir da URL (?periodo=mes | semana | hoje | mes_passado | personalizado&de=&ate=).
import { diaISO, inicioDoDiaSP, fimDoDiaSP, partesSP, instanteSP, somarDias, dataCurta } from "@/lib/datas";

export type Periodo = { chave: string; de: Date; ate: Date; rotulo: string; deISO: string; ateISO: string };

export function lerPeriodo(chave?: string, de?: string, ate?: string, agora = new Date()): Periodo {
  const p = partesSP(agora);
  let ini: Date; let fim: Date; let rotulo: string; let k = chave ?? "mes";
  if (k === "hoje") { ini = inicioDoDiaSP(agora); fim = fimDoDiaSP(agora); rotulo = "Hoje"; }
  else if (k === "semana") { ini = inicioDoDiaSP(somarDias(agora, -((p.semana + 6) % 7))); fim = fimDoDiaSP(agora); rotulo = "Esta semana"; }
  else if (k === "mes_passado") { ini = instanteSP(p.ano, p.mes - 1, 1); fim = new Date(instanteSP(p.ano, p.mes, 1).getTime() - 1); rotulo = "Mês passado"; }
  else if (k === "personalizado" && /^\d{4}-\d{2}-\d{2}$/.test(de ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(ate ?? "")) {
    const [a1, m1, d1] = de!.split("-").map(Number); const [a2, m2, d2] = ate!.split("-").map(Number);
    ini = instanteSP(a1, m1, d1); fim = fimDoDiaSP(instanteSP(a2, m2, d2, 12));
    rotulo = `${dataCurta(ini)} a ${dataCurta(fim)}`;
  } else { k = "mes"; ini = instanteSP(p.ano, p.mes, 1); fim = fimDoDiaSP(agora); rotulo = "Este mês"; }
  return { chave: k, de: ini, ate: fim, rotulo, deISO: diaISO(ini), ateISO: diaISO(fim) };
}
