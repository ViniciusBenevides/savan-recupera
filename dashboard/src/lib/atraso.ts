// Atraso / prescrição: os filtros da tela e da planilha são os mesmos, para a planilha trazer
// exatamente o que a tela mostra.
import { limitesDaFaixa, type Faixa } from "@/lib/recuperacao";

export type FaixaOuTodas = Faixa | "todas";
export type FiltrosAtraso = { carteira: number | null; q: string; faixa: FaixaOuTodas; ordem: string };

export const COLUNAS_ATRASO = "id, nome, cpf_cnpj, processo, saldo, vencimento, prescricao_em, status_cobranca, carteira_id, carteiras(nome)";

export const ORDENS_ATRASO = [
  { k: "antigos", t: "Mais antigos primeiro" },
  { k: "recentes", t: "Mais recentes primeiro" },
  { k: "saldo", t: "Maior saldo" },
  { k: "nome", t: "Nome" },
];

const limpar = (s: string) => s.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

export function lerFiltros(f: { carteira?: string | null; q?: string | null; faixa?: string | null; ordem?: string | null }): FiltrosAtraso {
  const faixas: FaixaOuTodas[] = ["todas", "lt1", "1a2", "2a3", "3a4", "4a5", "5mais", "sem"];
  return {
    carteira: Number(f.carteira) || null,
    q: limpar(f.q ?? ""),
    faixa: faixas.includes(f.faixa as FaixaOuTodas) ? (f.faixa as FaixaOuTodas) : "todas",
    ordem: ORDENS_ATRASO.some((o) => o.k === f.ordem) ? f.ordem! : "antigos",
  };
}

// O construtor de consulta do Supabase tem um tipo fundo demais para o TypeScript seguir por um
// genérico; aqui ele entra e sai com o mesmo tipo e os filtros são aplicados por dentro.
/* eslint-disable @typescript-eslint/no-explicit-any */

// Universo: quem está ativo, ainda não pagou e tem saldo. É o mesmo da triagem do Jurídico.
export function filtrarAtraso<Q>(consulta: Q, f: FiltrosAtraso, faixa: FaixaOuTodas = f.faixa, hoje = new Date()): Q {
  let q = (consulta as any).gt("saldo", 0).neq("status_cobranca", "pago").is("inativo_em", null);
  if (f.carteira) q = q.eq("carteira_id", f.carteira);
  if (f.q) {
    const digitos = f.q.replace(/\D/g, "");
    const partes = [`nome.ilike.%${f.q}%`, `processo.ilike.%${f.q}%`];
    if (digitos.length >= 3) partes.push(`cpf_cnpj.ilike.%${digitos}%`);
    q = q.or(partes.join(","));
  }
  if (faixa !== "todas") {
    const { de, ate, semData } = limitesDaFaixa(faixa, hoje);
    if (semData) q = q.is("vencimento", null);
    else {
      q = q.not("vencimento", "is", null);
      if (de) q = q.gt("vencimento", de);
      if (ate) q = q.lte("vencimento", ate);
    }
  }
  return q as Q;
}

export function ordenarAtraso<Q>(consulta: Q, ordem: string): Q {
  const q = consulta as any;
  if (ordem === "recentes") return q.order("vencimento", { ascending: false, nullsFirst: false }).order("id");
  if (ordem === "saldo") return q.order("saldo", { ascending: false }).order("id");
  if (ordem === "nome") return q.order("nome").order("id");
  return q.order("vencimento", { ascending: true, nullsFirst: false }).order("id");
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function enderecoAtraso(f: FiltrosAtraso, mudar: Partial<Record<"carteira" | "q" | "faixa" | "ordem" | "p", string>> = {}, base = "/atraso") {
  const u = new URLSearchParams();
  const tudo: Record<string, string> = {
    carteira: f.carteira ? String(f.carteira) : "", q: f.q, faixa: f.faixa === "todas" ? "" : f.faixa, ordem: f.ordem === "antigos" ? "" : f.ordem, p: "", ...mudar,
  };
  for (const [k, v] of Object.entries(tudo)) if (v) u.set(k, v);
  const s = u.toString();
  return `${base}${s ? `?${s}` : ""}`;
}
