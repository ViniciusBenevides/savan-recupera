import { contar } from "@/lib/utils";

// Contagem do que existe ligado a um devedor (fn_vinculos_devedor), para a Zona de risco da ficha.
export type Vinculos = {
  telefones: number; ocorrencias: number; agenda: number; conversas: number; mensagens: number;
  acordos: number; pagamentos: number; juridico_analises: number; juridico_casos: number; documentos: number; bloqueios: number;
};

// O que impede a exclusão definitiva: dinheiro, acordo, Jurídico e documento são prova, e o "não
// perturbe" precisa sobreviver a uma nova importação do mesmo CPF. Quem tem algum deles é
// inativado, nunca apagado (V5.7.01).
const BLOQUEIOS: { k: keyof Vinculos; um: string; varios: string }[] = [
  { k: "pagamentos", um: "pagamento registrado", varios: "pagamentos registrados" },
  { k: "acordos", um: "acordo", varios: "acordos" },
  { k: "juridico_analises", um: "análise jurídica", varios: "análises jurídicas" },
  { k: "juridico_casos", um: "caso jurídico", varios: "casos jurídicos" },
  { k: "documentos", um: "documento anexado", varios: "documentos anexados" },
  { k: "bloqueios", um: "pedido de não perturbe", varios: "pedidos de não perturbe" },
];

export const bloqueiosExclusao = (v: Vinculos) =>
  BLOQUEIOS.filter((b) => Number(v[b.k] ?? 0) > 0).map((b) => contar(Number(v[b.k]), b.um, b.varios));

// O que sai junto numa exclusão permitida (o histórico operacional simples).
export const levaJunto = (v: Vinculos) =>
  ([
    ["telefones", "telefone", "telefones"], ["ocorrencias", "ocorrência", "ocorrências"], ["agenda", "compromisso", "compromissos"],
    ["conversas", "conversa", "conversas"], ["mensagens", "mensagem", "mensagens"],
  ] as const).filter(([k]) => Number(v[k] ?? 0) > 0).map(([k, um, varios]) => contar(Number(v[k]), um, varios));
