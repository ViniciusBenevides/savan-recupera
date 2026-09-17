// Espelho de supabase/functions/_shared/bloqueio-whatsapp.ts — mantenha os dois em sincronia.
// A fonte da verdade, o porquê e os testes estão do lado do Deno.
//
// Bloqueio de alcance do WhatsApp ("reach-out time-lock"): o número proibido de iniciar conversa
// nova. Quem decide é `isActive`, nunca o tipo — o Baileys troca tipo desconhecido por `DEFAULT`.

export type BloqueioWhatsapp = {
  ativo: boolean;
  /** Até quando vale, em ISO. `null` quando não há bloqueio. */
  ate: string | null;
  tipo: string | null;
  /** O WhatsApp disse que está ativo mas não disse até quando. */
  semFimInformado: boolean;
};

/**
 * Quanto tempo segurar um bloqueio ativo que veio SEM horário de fim. O WhatsApp Web assume 60s
 * nesse caso; aqui a trava é de 1 hora, renovada a cada leitura que continuar dizendo "ativo" —
 * falha fechada: o erro caro deste projeto nunca foi perder um envio, foi perder o número.
 */
export const TRAVA_SEM_FIM_MS = 60 * 60_000;

function paraData(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    // Epoch em segundos (formato cru do WhatsApp) ou em milissegundos.
    return new Date(v < 1e12 ? v * 1000 : v);
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s || s === "0") return null;
    if (/^\d+$/.test(s)) return paraData(Number(s));
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Traduz o estado cru (qualquer uma das duas formas) para a regra deste projeto.
 *
 * Devolve `null` quando não há estado nenhum para ler — "não sei" é diferente de "não há
 * bloqueio", e quem chama decide o que fazer com a ignorância (em geral: manter o que já sabia).
 * Um bloqueio com fim no passado é tratado como encerrado: é o que sobra na cópia do Chatwoot
 * quando o chip caiu antes de o WhatsApp avisar que liberou.
 */
export function lerBloqueioWhatsapp(bruto: unknown, agora: Date = new Date()): BloqueioWhatsapp | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const o = bruto as Record<string, unknown>;
  const ativoCru = o.isActive ?? o.is_active;
  const fimCru = o.timeEnforcementEnds ?? o.time_enforcement_ends;
  const tipoCru = o.enforcementType ?? o.enforcement_type;
  if (ativoCru === undefined && fimCru === undefined && tipoCru === undefined) return null;

  const tipo = typeof tipoCru === "string" && tipoCru.trim() ? tipoCru.trim() : null;
  if (ativoCru !== true) return { ativo: false, ate: null, tipo, semFimInformado: false };

  const fim = paraData(fimCru);
  if (!fim) {
    return {
      ativo: true, ate: new Date(agora.getTime() + TRAVA_SEM_FIM_MS).toISOString(), tipo,
      semFimInformado: true,
    };
  }
  if (fim.getTime() <= agora.getTime()) return { ativo: false, ate: null, tipo, semFimInformado: false };
  return { ativo: true, ate: fim.toISOString(), tipo, semFimInformado: false };
}

/** A trava gravada em `chips.whatsapp_bloqueio_ate` ainda vale? */
export function bloqueioVigente(ate: string | null | undefined, agora: Date = new Date()): boolean {
  if (!ate) return false;
  const d = new Date(ate);
  return !Number.isNaN(d.getTime()) && d.getTime() > agora.getTime();
}

/**
 * Status que o chip deve ter, dado o status que a conectividade pede e o bloqueio.
 *
 * `ativo` e `aquecendo` são os únicos que o `campanha-lote` usa para abordar; com bloqueio de pé
 * o chip vai para `pausado`. Pausado continua respondendo quem já conversa — e é exatamente o que
 * o bloqueio do WhatsApp permite: ele barra conversa NOVA, não as que já existem.
 */
export function statusComBloqueio(statusAlvo: string, travado: boolean): string {
  return travado && (statusAlvo === "ativo" || statusAlvo === "aquecendo") ? "pausado" : statusAlvo;
}

/** "16/09 15:38" no horário de Brasília — o formato que a tela e as mensagens de erro usam. */
export function formatarFimBloqueio(ate: string | null | undefined): string {
  if (!ate) return "";
  const d = new Date(ate);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/** Texto único para o aviso e para a recusa de ativação — a tela e a API dizem a mesma coisa. */
export function mensagemBloqueio(ate: string | null | undefined): string {
  const quando = formatarFimBloqueio(ate);
  return `O WhatsApp bloqueou este número de iniciar conversas novas${quando ? ` até ${quando}` : ""}. ` +
    "Enquanto isso o chip não pode ser ativado; as conversas em andamento continuam sendo respondidas.";
}

/** Tradução do tipo informado pelo WhatsApp, só para exibir. Tipo desconhecido aparece cru. */
export function descreverTipoBloqueio(tipo: string | null | undefined): string | null {
  if (!tipo || tipo === "DEFAULT") return null;
  if (tipo === "RESTRICT_ALL_COMPANIONS") return "vale para todos os aparelhos conectados ao número (o robô é um deles)";
  if (tipo === "WEB_COMPANION_ONLY") return "vale para os aparelhos conectados (WhatsApp Web), onde o robô roda";
  if (tipo === "BIZ_QUALITY") return "motivo informado: qualidade da conta comercial";
  if (tipo.startsWith("BIZ_COMMERCE_VIOLATION")) return `motivo informado: violação de política de comércio (${tipo})`;
  return `tipo informado: ${tipo}`;
}
