// Campos do caso jurídico que a equipe preenche à mão (o "Novo caso jurídico" da ficha da V5).
export const ETAPAS = ["Pré-jurídico", "Documentação", "Notificação", "Ajuizamento", "Processo em andamento", "Execução", "Acordo judicial", "Encerrado"];
export const PRIORIDADES = ["Alta", "Média", "Baixa"];
export const STATUS_CASO = ["Aberto", "Preparação", "Protocolado", "Suspenso", "Encerrado"];

const texto = (v: unknown, n: number) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, n) : null;
};
const valor = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
};

/** Lê e confere os campos do corpo. Devolve o patch ou a mensagem de erro para a pessoa. */
export function lerCaso(b: Record<string, unknown>): { patch: Record<string, unknown> } | { erro: string } {
  const patch: Record<string, unknown> = {};
  if ("etapa" in b) { if (!ETAPAS.includes(String(b.etapa))) return { erro: "Etapa inválida." }; patch.etapa = b.etapa; }
  if ("prioridade" in b) { if (!PRIORIDADES.includes(String(b.prioridade))) return { erro: "Prioridade inválida." }; patch.prioridade = b.prioridade; }
  if ("status" in b) { if (!STATUS_CASO.includes(String(b.status))) return { erro: "Situação do caso inválida." }; patch.status = b.status; }
  if ("acao" in b) { const a = texto(b.acao, 160); if (!a) return { erro: "Informe o tipo de ação." }; patch.acao = a; }
  for (const [k, n] of [["cnj", 40], ["tribunal", 100], ["comarca", 100], ["vara", 100], ["responsavel", 120], ["proxima_acao", 220], ["observacao", 4000]] as const) {
    if (k in b) patch[k] = texto(b[k], n);
  }
  for (const k of ["valor_causa", "custas"] as const) {
    if (!(k in b)) continue;
    const v = valor(b[k]);
    if (v === undefined) return { erro: `Valor inválido em ${k === "custas" ? "custas" : "valor da causa"}.` };
    patch[k] = v;
  }
  if ("prazo" in b) {
    const p = String(b.prazo ?? "");
    if (p && !/^\d{4}-\d{2}-\d{2}$/.test(p)) return { erro: "Prazo inválido." };
    patch.prazo = p || null;
  }
  return { patch };
}
