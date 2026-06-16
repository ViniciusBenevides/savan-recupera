// Normalização dos dados da planilha (porta de import/importar_planilha.py para TS).
// Usada pela rota de upload para limpar CPF, telefone (E.164 + 9º dígito), datas e e-mails.

export const DDDS_VALIDOS = new Set<number>([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export function normalizarCpf(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const digitos = String(valor).replace(/\D/g, "");
  if (!digitos) return null;
  return digitos.length <= 11 ? digitos.padStart(11, "0") : digitos.padStart(14, "0");
}

// Aceita Date (xlsx cellDates), número serial do Excel, ou string dd/mm/aaaa | aaaa-mm-dd.
export function normalizarData(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  if (typeof valor === "number" && isFinite(valor)) {
    // serial do Excel (base 1899-12-30)
    const ms = Math.round((valor - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(valor).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export type TelTipo = "movel" | "fixo";

// Retorna { e164, tipo } ou null. Insere o 9º dígito em celular antigo de 8 dígitos.
export function normalizarTelefone(raw: unknown, tipoPadrao: TelTipo): { e164: string; tipo: TelTipo } | null {
  if (raw === null || raw === undefined) return null;
  let digitos = String(raw).replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    digitos = digitos.slice(2);
  }
  if (digitos.length < 10 || digitos.length > 11) return null;
  const ddd = Number(digitos.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) return null;
  let numero = digitos.slice(2);
  let tipo: TelTipo;
  if (numero.length === 8) {
    if ("6789".includes(numero[0])) {
      numero = "9" + numero;
      tipo = "movel";
    } else if ("2345".includes(numero[0])) {
      tipo = "fixo";
    } else {
      return null;
    }
  } else if (numero.length === 9) {
    if (numero[0] !== "9") return null;
    tipo = "movel";
  } else {
    return null;
  }
  if (tipoPadrao === "fixo" && tipo === "movel") tipo = "movel";
  return { e164: `+55${ddd}${numero}`, tipo };
}

export function calcularPrioridade(vencIso: string | null, saldo: number): number {
  const ano = vencIso ? Number(vencIso.slice(0, 4)) : 1990;
  return Math.max(0, ano - 1990) * 100 + Math.min(99, Math.floor((saldo || 0) / 100));
}

export function extrairEmails(...valores: unknown[]): string[] | null {
  const vistos = new Set<string>();
  const res: string[] = [];
  for (const v of valores) {
    if (!v) continue;
    for (let e of String(v).split(/[;,\s]+/)) {
      e = e.trim().toLowerCase();
      if (e.includes("@") && e.split("@").pop()!.includes(".") && !vistos.has(e)) {
        vistos.add(e);
        res.push(e);
      }
    }
  }
  return res.length ? res : null;
}

// remove acentos e baixa caixa, p/ casar cabeçalhos da planilha
export function chaveCabecalho(s: string): string {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}
