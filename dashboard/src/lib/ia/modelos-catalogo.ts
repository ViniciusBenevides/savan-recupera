// Catálogo curado dos modelos de chat da OpenAI úteis ao robô negociador (bot-turno).
// A OpenAI expõe os IDs que a conta acessa em GET /v1/models, mas SEM preço nem
// capacidade — então o "melhor custo-benefício" e o "melhor para cobrança" saem
// daqui, cruzados com o que a conta de fato acessa.
//
// Preços em USD por 1M de tokens (tarifa padrão, sem desconto de cache/batch).
// ⚠️ A OpenAI NÃO expõe preço por API — esta tabela é mantida à mão.
//   Fonte: https://developers.openai.com/api/docs/pricing
//   Última verificação: 2026-06-24. Reconfira e atualize quando a OpenAI mexer na tabela
//   ou lançar modelo novo; basta acrescentar/editar uma entrada abaixo.
//
// As notas (0–100) são curadas pensando no cenário de cobrança por WhatsApp:
//   inteligencia → capacidade geral de negociar/raciocinar;
//   cobranca     → PT-BR natural + function calling confiável + seguir guardrails
//                  jurídicos (nunca ameaçar, confirmar identidade, não inventar valor).
// Modelos "pro" (gpt-5.x-pro, ~$30/$180) ficam de fora de propósito: são exagero
// caro demais para a conversa de cobrança. Modelos de raciocínio (o3/o4-mini) entram,
// mas com nota de cobrança menor — a latência de "pensar" atrapalha o ritmo do chat.

export type ModeloCatalogo = {
  id: string;
  label: string;
  descricao: string;
  entrada: number; // USD / 1M tokens de entrada
  saida: number;   // USD / 1M tokens de saída
  inteligencia: number; // 0–100
  cobranca: number;     // 0–100 (adequação ao cenário de cobrança)
};

export const CATALOGO_MODELOS: ModeloCatalogo[] = [
  // ── Geração 5.x (mais recente) ──────────────────────────────────────────────
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    descricao: "Topo de linha atual. Máxima capacidade de negociar com nuance e seguir os guardrails jurídicos sem escorregar. O mais caro — reserve para casos sensíveis.",
    entrada: 5.0, saida: 30.0, inteligencia: 99, cobranca: 98,
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    descricao: "Quase o nível do 5.5 por bem menos. Excelente para negociações delicadas com custo mais controlado.",
    entrada: 2.5, saida: 15.0, inteligencia: 97, cobranca: 97,
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    descricao: "Versão enxuta do 5.4: muito esperto para o preço, com qualidade acima do 4.1 mini. Ótimo para alto volume com mais nuance.",
    entrada: 0.75, saida: 4.5, inteligencia: 89, cobranca: 92,
  },
  {
    id: "gpt-5",
    label: "GPT-5",
    descricao: "Geração 5 base: forte e com entrada mais barata que o 4.1. Ótimo equilíbrio para negociar com qualidade.",
    entrada: 1.25, saida: 10.0, inteligencia: 96, cobranca: 96,
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    descricao: "Custo-benefício moderno: a inteligência da geração 5 a preço baixo. Forte candidato a padrão do robô.",
    entrada: 0.25, saida: 2.0, inteligencia: 87, cobranca: 91,
  },
  {
    id: "gpt-5-nano",
    label: "GPT-5 nano",
    descricao: "O mais barato da geração 5. Rápido para fluxos simples; pode perder nuance em casos delicados.",
    entrada: 0.05, saida: 0.4, inteligencia: 72, cobranca: 74,
  },
  // ── Geração 4.1 ─────────────────────────────────────────────────────────────
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    descricao: "Topo da geração 4.1. Negocia com nuance e segue os guardrails à risca; sólido, porém superado em qualidade pela geração 5.",
    entrada: 2.0, saida: 8.0, inteligencia: 95, cobranca: 96,
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    descricao: "Equilíbrio comprovado: esperto o suficiente para a negociação e function calling, com custo baixo para alto volume. Padrão atual do robô.",
    entrada: 0.4, saida: 1.6, inteligencia: 85, cobranca: 90,
  },
  {
    id: "gpt-4.1-nano",
    label: "GPT-4.1 nano",
    descricao: "Barato e rápido. Bom para fluxos simples; pode perder nuance em negociações mais delicadas.",
    entrada: 0.1, saida: 0.4, inteligencia: 70, cobranca: 72,
  },
  // ── Geração 4o ──────────────────────────────────────────────────────────────
  {
    id: "gpt-4o",
    label: "GPT-4o",
    descricao: "Geração anterior de alta qualidade. Forte, porém mais caro que o 4.1 mini para um ganho pequeno em texto.",
    entrada: 2.5, saida: 10.0, inteligencia: 90, cobranca: 88,
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    descricao: "Econômico da geração anterior. Alternativa barata ao 4.1 mini, um pouco menos consistente em PT-BR.",
    entrada: 0.15, saida: 0.6, inteligencia: 75, cobranca: 78,
  },
  // ── Raciocínio (o-series) ───────────────────────────────────────────────────
  {
    id: "o3",
    label: "o3",
    descricao: "Modelo de raciocínio: ótimo para casos jurídicos complexos, mas 'pensa' antes de responder — mais lento e caro. Costuma ser exagero para a conversa de cobrança.",
    entrada: 2.0, saida: 8.0, inteligencia: 96, cobranca: 84,
  },
  {
    id: "o4-mini",
    label: "o4-mini",
    descricao: "Raciocínio econômico: bom para análise, porém a latência extra de 'pensar' atrapalha o ritmo de uma conversa no WhatsApp.",
    entrada: 1.1, saida: 4.4, inteligencia: 86, cobranca: 79,
  },
];

const POR_ID = new Map(CATALOGO_MODELOS.map((m) => [m.id, m]));
export const buscarCatalogo = (id: string): ModeloCatalogo | undefined => POR_ID.get(id);

// Custo "misto" no perfil de uma negociação: costuma haver mais entrada (histórico +
// contexto + guardrails) do que saída (respostas curtas), por isso pesa 60/40.
export const custoMisto = (m: ModeloCatalogo): number => m.entrada * 0.6 + m.saida * 0.4;

// Qualidade mínima para um modelo concorrer a "custo-benefício": custo-benefício é
// EQUILÍBRIO, não o mais barato — abaixo disso a economia não compensa o risco.
const QUALIDADE_MINIMA = 80;

// Dadas as IDs do catálogo que a conta realmente acessa, sugere:
//  - custo_beneficio → maior (inteligência por dólar) entre os de qualidade ≥ mínima;
//  - cobranca        → maior nota de adequação ao cenário de cobrança.
// Se nenhum catalogado estiver disponível, recomenda sobre o catálogo inteiro (guia).
export function recomendar(idsDisponiveis: string[]): {
  custo_beneficio: string | null; cobranca: string | null;
} {
  const disp = CATALOGO_MODELOS.filter((m) => idsDisponiveis.includes(m.id));
  const base = disp.length ? disp : CATALOGO_MODELOS;
  const candCB = base.filter((m) => m.inteligencia >= QUALIDADE_MINIMA);
  const baseCB = candCB.length ? candCB : base;
  const custo_beneficio = baseCB.reduce((a, b) =>
    b.inteligencia / custoMisto(b) > a.inteligencia / custoMisto(a) ? b : a).id;
  const cobranca = base.reduce((a, b) => (b.cobranca > a.cobranca ? b : a)).id;
  return { custo_beneficio, cobranca };
}

// Heurística: o ID é um modelo de CHAT (não embedding/áudio/imagem/etc.)?
// Usada para filtrar a lista bruta de GET /v1/models da conta.
export function ehModeloChat(id: string): boolean {
  if (!/^(gpt-|o[134]|chatgpt)/i.test(id)) return false;
  return !/(embedding|whisper|tts|audio|realtime|transcribe|dall-e|image|moderation|search|babbage|davinci|computer-use|codex)/i.test(id);
}
