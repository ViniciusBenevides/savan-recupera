// Tarifas de referência para a calculadora de custos (Z-API+Salvy × Meta Cloud API).
// ⚠️ A Meta muda a tabela com frequência e o preço final depende de câmbio/conta. Estes são
//   VALORES DE REFERÊNCIA, mantidos à mão (mesmo padrão do lib/ia/modelos-catalogo.ts).
//   Fonte: developers.facebook.com/.../whatsapp/pricing (conversation-based / por mensagem, BR).
//   Última verificação: 2026-06-29. Reconfira na Meta antes de decidir — a calculadora deixa
//   o usuário sobrescrever os valores na tela.
//
// Modelo de cobrança da Meta (Brasil, pós-mudança de nov/2024): cobra-se POR MENSAGEM de modelo
// iniciada pela empresa, por categoria. Conversa de SERVIÇO (a pessoa respondeu, janela de 24h)
// é gratuita. Por isso a prospecção fria (sempre template de marketing) é o que pesa no custo.

export type CategoriaTarifa = "marketing" | "utility" | "authentication" | "service";

// R$ por mensagem de modelo iniciada pela empresa (Brasil, referência).
export const META_TARIFAS_BRL: Record<CategoriaTarifa, number> = {
  marketing: 0.39,      // abordagem fria de cobrança cai aqui
  utility: 0.08,        // lembrete/atualização de algo já em andamento
  authentication: 0.18, // código/verificação
  service: 0.0,         // resposta dentro da janela de 24h — gratuita
};

// Custo fixo mensal do caminho Z-API por NÚMERO (instância Z-API + chip/SIM Salvy), referência.
export const ZAPI_CUSTOS_BRL = {
  instanciaMes: 99,  // assinatura de 1 instância Z-API / mês
  simSalvyMes: 40,   // 1 chip/linha Salvy / mês
};

export type CenarioCusto = {
  numeros: number;        // quantos números
  msgsDia: number;        // mensagens iniciadas pela empresa, por número, por dia
  diasMes: number;        // dias úteis no mês
  pctMarketing: number;   // 0–100: fatia das iniciadas que é marketing (frio)
  pctUtility: number;     // 0–100: fatia que é utility
  // o restante (100 - marketing - utility) é tratado como resposta/serviço (grátis na Meta)
};

export type ResultadoCusto = {
  zapiMes: number;
  metaMes: number;
  metaPorCategoria: { marketing: number; utility: number; service: number };
  msgsMes: number;
  economiaMeta: number; // zapi - meta (positivo = Meta mais barata)
};

export function calcularCusto(c: CenarioCusto, tarifas = META_TARIFAS_BRL, zapi = ZAPI_CUSTOS_BRL): ResultadoCusto {
  const msgsMes = Math.max(0, c.numeros) * Math.max(0, c.msgsDia) * Math.max(0, c.diasMes);
  const fMkt = Math.min(100, Math.max(0, c.pctMarketing)) / 100;
  const fUtl = Math.min(100, Math.max(0, c.pctUtility)) / 100;
  const fSvc = Math.max(0, 1 - fMkt - fUtl);

  const cMkt = msgsMes * fMkt * tarifas.marketing;
  const cUtl = msgsMes * fUtl * tarifas.utility;
  const cSvc = msgsMes * fSvc * tarifas.service; // ~0
  const metaMes = cMkt + cUtl + cSvc;

  const zapiMes = Math.max(0, c.numeros) * (zapi.instanciaMes + zapi.simSalvyMes);

  return {
    zapiMes,
    metaMes,
    metaPorCategoria: { marketing: cMkt, utility: cUtl, service: cSvc },
    msgsMes,
    economiaMeta: zapiMes - metaMes,
  };
}
