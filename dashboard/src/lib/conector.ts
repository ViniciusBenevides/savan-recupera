// Espelho de supabase/functions/_shared/conector.ts — mantenha os dois em sincronia.
// A fonte da verdade e os testes estão do lado do Deno.

export const CONECTORES = ["baileys", "meta_cloud"] as const;
export type Conector = (typeof CONECTORES)[number];
export const CONECTOR_PADRAO: Conector = "baileys";

const MAX_NOME_INSTANCIA = 48;

export function ehConectorSuportado(valor: unknown): valor is Conector {
  return typeof valor === "string" && (CONECTORES as readonly string[]).includes(valor);
}

export function nomeInstanciaEvolution(nome: string, chipId: number): string {
  if (!Number.isInteger(chipId) || chipId <= 0) {
    throw new Error(`chipId inválido para nome de instância: ${chipId}`);
  }
  const sufixo = `-${chipId}`;
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const limite = MAX_NOME_INSTANCIA - sufixo.length;
  const prefixo = (base || "chip").slice(0, limite).replace(/-+$/g, "");
  return `${prefixo}${sufixo}`;
}
