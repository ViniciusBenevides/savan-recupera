// Lê o .xlsx enviado e devolve devedores normalizados + relatório de linhas.
// Dois caminhos de EXTRAÇÃO (cabeçalho do modelo OU "receita" da IA) compartilham o
// mesmo NÚCLEO de normalização/dedup (montarDevedores) — os valores das células sempre
// passam pelos normalizadores determinísticos (CPF, telefone E.164, datas, moeda).
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
export type Stats = { total: number; importar: number; dup_cpf: number; sem_cpf: number; com_movel: number; telefones: number; tel_invalidos: number; soma_saldo: number };
export type ResultadoParse = {
  devedores: DevedorRec[];
  stats: Stats;
  erros: { linha: number; motivo: string }[];
};

// Linha já "extraída" (mas ainda não normalizada): valores crus das células por campo.
// telefonesBrutos guarda strings de telefone (já separadas por , ; /). Os demais campos
// preservam o tipo original da célula (Date/number/string) para os normalizadores.
export type LinhaBruta = {
  numLinha: number;
  campos: Record<string, unknown>;
  telefonesBrutos: string[];
};

// ----- Receita gerada pela IA (schema fechado; ver mapear-ia.ts) -----
export type CampoReceita =
  | "cpf" | "nome" | "saldo" | "telefone" | "telefone2"
  | "vencimento" | "cidade" | "uf" | "referencia" | "email";
export type TransformReceita =
  | "nenhum" | "centavos" | "extrair_documento" | "extrair_telefones" | "juntar" | "so_digitos";
export type RegraCampo = { colunas: number[]; transform: TransformReceita };
export type Receita = {
  linha_cabecalho: number;
  linha_dados_inicio: number;
  campos: Partial<Record<CampoReceita, RegraCampo>>;
  observacoes?: string;
};

export const CAMPOS_RECEITA: CampoReceita[] = [
  "cpf", "nome", "saldo", "telefone", "telefone2", "vencimento", "cidade", "uf", "referencia", "email",
];
export const TRANSFORMS_RECEITA: TransformReceita[] = [
  "nenhum", "centavos", "extrair_documento", "extrair_telefones", "juntar", "so_digitos",
];
export const CAMPOS_OBRIGATORIOS: CampoReceita[] = ["cpf", "nome", "saldo", "telefone"];

function stats0(): Stats {
  return { total: 0, importar: 0, dup_cpf: 0, sem_cpf: 0, com_movel: 0, telefones: 0, tel_invalidos: 0, soma_saldo: 0 };
}

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

// ----- Leitura da grade crua -----
export type Grade = { nomeAba: string; linhas: unknown[][] };
export function lerGrade(buf: ArrayBuffer | Buffer): Grade {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const nomeAba = wb.SheetNames.find((n) => chaveCabecalho(n) === "devedores") ?? wb.SheetNames[0];
  const ws = wb.Sheets[nomeAba];
  const linhas: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
  return { nomeAba, linhas };
}

function linhaVazia(row: unknown[] | undefined): boolean {
  return !row || row.length === 0 || row.every((c) => c === null || c === "");
}

// ----- Caminho PADRÃO (cabeçalho do modelo na 1ª linha) -----
function extrairPadrao(grade: unknown[][]): { linhas?: LinhaBruta[]; erro?: { linha: number; motivo: string } } {
  const cabec = grade[0].map((c) => MAPA_CABECALHO[chaveCabecalho(String(c ?? ""))] ?? null);
  const idx = (campo: string) => cabec.indexOf(campo);
  const obrig = ["cpf", "nome", "saldo", "telefone"];
  const faltando = obrig.filter((c) => idx(c) < 0);
  if (faltando.length) {
    return { erro: { linha: 1, motivo: `colunas_obrigatorias_ausentes: ${faltando.join(", ")}` } };
  }

  const linhas: LinhaBruta[] = [];
  for (let i = 1; i < grade.length; i++) {
    const row = grade[i];
    if (linhaVazia(row)) continue;
    const get = (campo: string) => { const j = idx(campo); return j >= 0 ? row[j] : null; };
    const campos: Record<string, unknown> = {
      cpf: get("cpf"), nome: get("nome"), saldo: get("saldo"), vencimento: get("vencimento"),
      cidade: get("cidade"), uf: get("uf"), referencia: get("referencia"), email: get("email"),
    };
    const telefonesBrutos: string[] = [];
    for (const campo of ["telefone", "telefone2"] as const) {
      const val = get(campo);
      if (val) for (const b of String(val).split(/[,;/]+/)) if (b.trim()) telefonesBrutos.push(b.trim());
    }
    linhas.push({ numLinha: i + 1, campos, telefonesBrutos });
  }
  return { linhas };
}

// ----- Caminho IA (aplica a receita) -----
function celulaStr(row: unknown[], idx: number): string {
  const v = idx >= 0 && idx < row.length ? row[idx] : null;
  return v === null || v === undefined ? "" : String(v).trim();
}

// extrai um doc (11 ou 14 dígitos) de dentro de um texto; fallback: todos os dígitos
function extrairDocumento(texto: string): string {
  for (const m of texto.matchAll(/\d[\d.\-/\s]*\d/g)) {
    const so = m[0].replace(/\D/g, "");
    if (so.length === 11 || so.length === 14) return so;
  }
  return texto.replace(/\D/g, "");
}

// extrai pedaços que parecem telefone de dentro de um texto livre
function extrairTelefones(texto: string): string[] {
  const out: string[] = [];
  for (const m of texto.matchAll(/\+?\d[\d()\-\s]{7,}\d/g)) {
    const t = m[0].trim();
    if (t.replace(/\D/g, "").length >= 8) out.push(t);
  }
  return out;
}

function aplicarTransform(row: unknown[], cols: number[], transform: TransformReceita): unknown {
  const partes = cols.map((c) => celulaStr(row, c));
  switch (transform) {
    case "centavos": {
      const digitos = celulaStr(row, cols[0]).replace(/\D/g, "");
      return digitos ? Number(digitos) / 100 : null;
    }
    case "extrair_documento":
      return extrairDocumento(partes.join(" "));
    case "so_digitos":
      return partes.join(" ").replace(/\D/g, "");
    case "juntar":
      return partes.filter(Boolean).join(" ").trim();
    case "nenhum":
    default:
      // 1 coluna: preserva o tipo cru (Date/number) para os normalizadores
      if (cols.length === 1) { const i = cols[0]; return i >= 0 && i < row.length ? row[i] : null; }
      return partes.filter(Boolean).join(" ").trim();
  }
}

function extrairReceita(grade: unknown[][], receita: Receita): LinhaBruta[] {
  const inicio = Number.isInteger(receita.linha_dados_inicio)
    ? receita.linha_dados_inicio
    : (receita.linha_cabecalho ?? -1) + 1;
  const linhas: LinhaBruta[] = [];
  for (let i = Math.max(0, inicio); i < grade.length; i++) {
    const row = grade[i] ?? [];
    if (linhaVazia(row)) continue;
    const campos: Record<string, unknown> = {};
    const telefonesBrutos: string[] = [];
    for (const campo of CAMPOS_RECEITA) {
      const regra = receita.campos[campo];
      if (!regra) continue;
      const cols = (regra.colunas ?? []).filter((c) => Number.isInteger(c) && c >= 0);
      if (cols.length === 0) continue;
      if (campo === "telefone" || campo === "telefone2") {
        if (regra.transform === "extrair_telefones") {
          for (const c of cols) telefonesBrutos.push(...extrairTelefones(celulaStr(row, c)));
        } else {
          for (const c of cols) for (const p of celulaStr(row, c).split(/[,;/]+/)) if (p.trim()) telefonesBrutos.push(p.trim());
        }
        continue;
      }
      campos[campo] = aplicarTransform(row, cols, regra.transform);
    }
    linhas.push({ numLinha: i + 1, campos, telefonesBrutos });
  }
  return linhas;
}

// ----- Núcleo: normaliza + deduplica + estatísticas (compartilhado pelos dois caminhos) -----
export function montarDevedores(linhas: LinhaBruta[]): ResultadoParse {
  const stats = stats0();
  const erros: { linha: number; motivo: string }[] = [];
  const porCpf = new Map<string, DevedorRec>();

  for (const ln of linhas) {
    stats.total++;
    const cpf = normalizarCpf(ln.campos.cpf);
    const nome = String(ln.campos.nome ?? "").trim();
    if (!nome) { erros.push({ linha: ln.numLinha, motivo: "sem_nome" }); continue; }
    let cpfKey = cpf;
    if (!cpfKey) { stats.sem_cpf++; cpfKey = `SEMCPF-${ln.numLinha}`; }

    const saldo = parseSaldo(ln.campos.saldo);
    const venc = normalizarData(ln.campos.vencimento);

    const existente = porCpf.get(cpfKey);
    const alvo: DevedorRec = existente ?? {
      cpf_cnpj: cpf ?? "00000000000",
      nome: nome.toUpperCase(),
      saldo,
      vencimento: venc,
      cidade: ln.campos.cidade ? String(ln.campos.cidade).trim() : null,
      uf: ln.campos.uf ? String(ln.campos.uf).trim().slice(0, 2).toUpperCase() : null,
      processo: ln.campos.referencia ? String(ln.campos.referencia).trim() : null,
      emails: extrairEmails(ln.campos.email),
      prioridade: 0,
      status_cobranca: "sem_whatsapp",
      telefones: [],
    };

    const vistos = new Set(alvo.telefones.map((t) => t.telefone_e164));
    for (const raw of ln.telefonesBrutos) {
      const r = normalizarTelefone(raw, "movel");
      if (!r) { if (String(raw).trim()) stats.tel_invalidos++; continue; }
      if (vistos.has(r.e164)) continue;
      vistos.add(r.e164);
      alvo.telefones.push({ telefone_e164: r.e164, telefone_raw: String(raw).trim(), ordem: alvo.telefones.length + 1, tipo: r.tipo });
    }

    if (existente) stats.dup_cpf++;
    else porCpf.set(cpfKey, alvo);
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

// Sem receita: usa o cabeçalho do modelo. Com receita: usa o de-para da IA.
export function parsePlanilha(buf: ArrayBuffer | Buffer, receita?: Receita): ResultadoParse {
  const { linhas: grade } = lerGrade(buf);
  if (grade.length < 2) return { devedores: [], stats: stats0(), erros: [{ linha: 0, motivo: "planilha_vazia" }] };

  let linhas: LinhaBruta[];
  if (receita) {
    linhas = extrairReceita(grade, receita);
  } else {
    const r = extrairPadrao(grade);
    if (r.erro) return { devedores: [], stats: stats0(), erros: [r.erro] };
    linhas = r.linhas!;
  }
  return montarDevedores(linhas);
}

// Aplica a receita só às primeiras `n` linhas de dados (para a prévia da revisão).
export function previewReceita(grade: unknown[][], receita: Receita, n = 3): ResultadoParse {
  const linhas = extrairReceita(grade, receita).slice(0, n);
  return montarDevedores(linhas);
}
