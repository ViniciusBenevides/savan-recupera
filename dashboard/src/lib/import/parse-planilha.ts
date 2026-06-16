// Lê o .xlsx enviado e devolve devedores normalizados + relatório de linhas.
import * as XLSX from "xlsx";
import {
  normalizarCpf, normalizarData, normalizarTelefone, calcularPrioridade,
  extrairEmails, chaveCabecalho, type TelTipo,
} from "./normalizar";
import { MAPA_CABECALHO } from "./modelo";

export type TelefoneRec = { telefone_e164: string; telefone_raw: string; ordem: number; tipo: TelTipo };
export type DevedorRec = {
  cpf_cnpj: string;
  nome: string;
  saldo: number;
  vencimento: string | null;
  cidade: string | null;
  uf: string | null;
  processo: string | null;
  emails: string[] | null;
  prioridade: number;
  status_cobranca: "na_fila" | "sem_whatsapp";
  telefones: TelefoneRec[];
};
export type ResultadoParse = {
  devedores: DevedorRec[];
  stats: { total: number; importar: number; dup_cpf: number; sem_cpf: number; com_movel: number; telefones: number; tel_invalidos: number; soma_saldo: number };
  erros: { linha: number; motivo: string }[];
};

function parseSaldo(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Math.round(v * 100) / 100;
  // "1.500,00" ou "1500.00" ou "1500,5"
  let s = String(v).replace(/[^\d.,-]/g, "").trim();
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

export function parsePlanilha(buf: ArrayBuffer | Buffer): ResultadoParse {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  // usa a aba "Devedores" se existir; senão a primeira
  const nomeAba = wb.SheetNames.find((n) => chaveCabecalho(n) === "devedores") ?? wb.SheetNames[0];
  const ws = wb.Sheets[nomeAba];
  const linhas: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });

  const stats = { total: 0, importar: 0, dup_cpf: 0, sem_cpf: 0, com_movel: 0, telefones: 0, tel_invalidos: 0, soma_saldo: 0 };
  const erros: { linha: number; motivo: string }[] = [];
  if (linhas.length < 2) return { devedores: [], stats, erros: [{ linha: 0, motivo: "planilha_vazia" }] };

  // mapeia cabeçalho -> índice de coluna
  const cabec = linhas[0].map((c) => MAPA_CABECALHO[chaveCabecalho(String(c ?? ""))] ?? null);
  const idx = (campo: string) => cabec.indexOf(campo);
  const obrig = ["cpf", "nome", "saldo", "telefone"];
  const faltando = obrig.filter((c) => idx(c) < 0);
  if (faltando.length) {
    return { devedores: [], stats, erros: [{ linha: 1, motivo: `colunas_obrigatorias_ausentes: ${faltando.join(", ")}` }] };
  }

  const porCpf = new Map<string, DevedorRec>();

  for (let i = 1; i < linhas.length; i++) {
    const row = linhas[i];
    const numLinha = i + 1; // linha real na planilha (1-based, +1 do cabeçalho)
    const get = (campo: string) => { const j = idx(campo); return j >= 0 ? row[j] : null; };
    if (!row || row.every((c) => c === null || c === "")) continue;
    stats.total++;

    const cpf = normalizarCpf(get("cpf"));
    const nome = String(get("nome") ?? "").trim();
    if (!nome) { erros.push({ linha: numLinha, motivo: "sem_nome" }); continue; }
    let cpfKey = cpf;
    if (!cpfKey) { stats.sem_cpf++; cpfKey = `SEMCPF-${numLinha}`; }

    const saldo = parseSaldo(get("saldo"));
    const venc = normalizarData(get("vencimento"));

    // telefones (telefone + telefone2, podem ter vários separados por , ; /)
    const brutos: { raw: string; padrao: TelTipo }[] = [];
    for (const campo of ["telefone", "telefone2"] as const) {
      const val = get(campo);
      if (val) for (const b of String(val).split(/[,;/]+/)) brutos.push({ raw: b, padrao: "movel" });
    }

    const existente = porCpf.get(cpfKey);
    const alvo: DevedorRec = existente ?? {
      cpf_cnpj: cpf ?? "00000000000",
      nome: nome.toUpperCase(),
      saldo,
      vencimento: venc,
      cidade: (get("cidade") ? String(get("cidade")).trim() : null),
      uf: (get("uf") ? String(get("uf")).trim().slice(0, 2).toUpperCase() : null),
      processo: (get("referencia") ? String(get("referencia")).trim() : null),
      emails: extrairEmails(get("email")),
      prioridade: 0,
      status_cobranca: "sem_whatsapp",
      telefones: [],
    };

    const vistos = new Set(alvo.telefones.map((t) => t.telefone_e164));
    for (const { raw, padrao } of brutos) {
      const r = normalizarTelefone(raw, padrao);
      if (!r) { if (String(raw).trim()) stats.tel_invalidos++; continue; }
      if (vistos.has(r.e164)) continue;
      vistos.add(r.e164);
      alvo.telefones.push({ telefone_e164: r.e164, telefone_raw: String(raw).trim(), ordem: alvo.telefones.length + 1, tipo: r.tipo });
    }

    if (existente) {
      stats.dup_cpf++;
    } else {
      porCpf.set(cpfKey, alvo);
    }
  }

  const devedores = [...porCpf.values()];
  for (const d of devedores) {
    const temMovel = d.telefones.some((t) => t.tipo === "movel");
    d.status_cobranca = temMovel ? "na_fila" : "sem_whatsapp";
    d.prioridade = calcularPrioridade(d.vencimento, d.saldo);
    if (temMovel) stats.com_movel++;
    stats.telefones += d.telefones.length;
    stats.soma_saldo += d.saldo;
  }
  stats.importar = devedores.length;

  return { devedores, stats, erros };
}
