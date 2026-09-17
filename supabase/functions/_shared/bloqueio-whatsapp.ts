// Bloqueio de alcance do WhatsApp ("reach-out time-lock") — só decisão pura aqui.
//
// POR QUE EXISTE. Em 16/09/2026 o Chip 2 caiu quatro vezes, sempre minutos depois de uma abordagem.
// O inbox dele no Chatwoot mostrava `reachout_time_lock: { is_active: true, enforcement_type:
// "RESTRICT_ALL_COMPANIONS" }` — o WhatsApp proibindo o número de iniciar conversa nova, em todos os
// aparelhos vinculados (o baileys-api é um deles). Ninguém lia esse campo: a cada QR novo o chip
// voltava a abordar com o bloqueio de pé, e cada tentativa é mais um "alcance" contado contra o
// número. Esta regra existe para que o sistema avise e não deixe ativar até o bloqueio sair.
//
// As DUAS formas em que o estado chega, com o mesmo significado:
//   - baileys-api `GET /connections/{n}/reachout-timelock` → `{ isActive, timeEnforcementEnds,
//     enforcementType }` (camelCase; a data vem serializada em ISO);
//   - cópia do Chatwoot em `provider_connection.reachout_time_lock` → `{ is_active,
//     time_enforcement_ends, enforcement_type }`.
//
// O que decide é `isActive`, NUNCA `enforcementType`. O Baileys converte o tipo que não conhece em
// `DEFAULT` — e `DEFAULT` é documentado como "sem restrição" —, então `RESTRICT_ALL_COMPANIONS`
// pode chegar como `DEFAULT` com `isActive: true`. O tipo serve só para mostrar na tela.

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
