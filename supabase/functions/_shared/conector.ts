/**
 * Qual transporte atende um chip e se ele está apto a abordar.
 *
 * "Abordar" é mandar mensagem para quem não escreveu primeiro (ver CONTEXT.md). Responder quem
 * escreveu não passa por aqui — um chip degradado continua respondendo.
 */

// `baileys` = Evolution API. `baileys_chatwoot` = baileys-api (fazer-ai), o provedor Baileys
// nativo do Chatwoot self-hosted — segundo transporte não-oficial, adicionado em 03/09/2026
// depois de um bloqueio de pareamento na Evolution. As DUAS variantes têm a mesma semântica de
// negócio (texto livre do bloco de disparo, ritmo, digitação) — só o transporte muda.
export const CONECTORES = ["baileys", "baileys_chatwoot", "meta_cloud"] as const;
export type Conector = (typeof CONECTORES)[number];

/** Os dois transportes não-oficiais — em oposição a `meta_cloud`, o canal suspenso. */
export function ehConectorBaileys(conector: Conector): boolean {
  return conector === "baileys" || conector === "baileys_chatwoot";
}

export const CONECTOR_PADRAO: Conector = "baileys";

/** Limite defensivo: nomes longos de instância complicam a URL da Evolution. */
const MAX_NOME_INSTANCIA = 48;

export function ehConectorSuportado(valor: unknown): valor is Conector {
  return typeof valor === "string" && (CONECTORES as readonly string[]).includes(valor);
}

/** Conector do chip, tolerante a nulo/maiúsculas/lixo. Desconhecido cai no padrão. */
export function conectorDoChip(chip: { conector?: unknown }): Conector {
  const bruto = typeof chip.conector === "string" ? chip.conector.trim().toLowerCase() : "";
  return ehConectorSuportado(bruto) ? bruto : CONECTOR_PADRAO;
}

/**
 * Nome da instância na Evolution. O id do chip vai no fim para garantir unicidade mesmo quando
 * dois chips têm o mesmo apelido.
 */
export function nomeInstanciaEvolution(nome: string, chipId: number): string {
  if (!Number.isInteger(chipId) || chipId <= 0) {
    throw new Error(`chipId inválido para nome de instância: ${chipId}`);
  }
  const sufixo = `-${chipId}`;
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // tira acento (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")       // tudo que não é alfanumérico vira hífen
    .replace(/^-+|-+$/g, "");          // sem hífen sobrando nas pontas

  const limite = MAX_NOME_INSTANCIA - sufixo.length;
  const prefixo = (base || "chip").slice(0, limite).replace(/-+$/g, "");
  return `${prefixo}${sufixo}`;
}

export type VeredictoAbordagem =
  | { pode: true }
  | {
    pode: false;
    motivo: "chip_de_equipe" | "canal_meta_suspenso" | "sem_instancia_evolution" | "sem_numero_e164";
  };

/**
 * O chip está apto a abordar?
 *
 * Nada aqui olha ritmo, janela ou aquecimento — isso é da Fatia 5. Aqui é só o transporte:
 * existe caminho de saída para este chip? O identificador da conexão muda por provedor: a
 * Evolution usa `instancia_evolution` (nome que ela escolheu); o baileys-api usa o próprio
 * `numero_e164` do chip como identificador — é assim que a API dele endereça a conexão.
 */
export function chipPodeAbordar(chip: {
  conector?: unknown;
  papel?: unknown;
  instancia_evolution?: unknown;
  numero_e164?: unknown;
}): VeredictoAbordagem {
  // Escalador humano recebe a conversa escalada; nunca inicia contato.
  if (chip.papel === "equipe") return { pode: false, motivo: "chip_de_equipe" };

  const conector = conectorDoChip(chip);

  // A WABA da MC CRED está banida (§38). O código continua no repo, o caminho fica fechado.
  if (conector === "meta_cloud") return { pode: false, motivo: "canal_meta_suspenso" };

  if (conector === "baileys_chatwoot") {
    const numero = typeof chip.numero_e164 === "string" ? chip.numero_e164.trim() : "";
    if (!numero) return { pode: false, motivo: "sem_numero_e164" };
    return { pode: true };
  }

  const instancia = typeof chip.instancia_evolution === "string"
    ? chip.instancia_evolution.trim()
    : "";
  if (!instancia) return { pode: false, motivo: "sem_instancia_evolution" };

  return { pode: true };
}
