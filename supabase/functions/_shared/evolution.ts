/**
 * Decisões do transporte pela Evolution API (Baileys por dentro).
 *
 * Só decisão pura aqui — nada de rede. O I/O mora em `evolution-client.ts`. A separação existe
 * porque estas regras precisam ser testáveis sem a Evolution no ar, e porque são elas que
 * carregam as lições dos incidentes: §31 (chips restringidos), §36 (fila descartada por
 * indisponibilidade lida como invalidez) e §38 (ban da conta oficial).
 */

// ── JID ──────────────────────────────────────────────────────────────────────────────────

const SERVIDOR_PN = "@s.whatsapp.net";

/**
 * E.164 → JID de telefone (PNJID).
 *
 * Aceita a formatação humana que aparece na planilha e no painel (`+`, espaço, parêntese, hífen).
 * Não tenta adivinhar o 9º dígito: quem concilia isso é a Evolution, via `mergeBrazilContacts` na
 * integração com o Chatwoot (ver §11 do guia do Baileys).
 */
export function numeroParaJid(numero: string): string {
  const digitos = String(numero ?? "").replace(/\D/g, "");
  if (!digitos) throw new Error(`número sem dígitos: ${JSON.stringify(numero)}`);
  return `${digitos}${SERVIDOR_PN}`;
}

// ── Ritmo de digitação ───────────────────────────────────────────────────────────────────

/** Ninguém responde no mesmo instante — mesmo uma resposta curta leva um tempo. */
const PISO_MS = 1_200;
/** Ninguém fica um minuto digitando antes de mandar. Também evita segurar a fila. */
const TETO_MS = 15_000;
/** ~1000 caracteres por minuto é digitação humana rápida, não robótica. */
const MS_POR_CARACTERE = 60;
/** Variação de ±25%: dois envios do mesmo texto nunca levam o mesmo tempo. */
const VARIACAO = 0.25;

/**
 * Quanto tempo o chip fica "digitando…" antes de mandar `texto`.
 *
 * O cálculo é nosso de propósito. A semântica exata do `delay` da Evolution é questão em aberto no
 * upstream, então preferimos um número que a gente controla e testa a depender de comportamento
 * sutil de terceiro.
 *
 * @param aleatorio injetado para o teste ser determinístico; em produção, `Math.random`.
 */
export function tempoDigitacao(texto: string, aleatorio: () => number = Math.random): number {
  const base = String(texto ?? "").length * MS_POR_CARACTERE;
  const fator = 1 + (aleatorio() * 2 - 1) * VARIACAO;   // [1-VARIACAO, 1+VARIACAO]
  const comVariacao = base * fator;
  return Math.round(Math.min(TETO_MS, Math.max(PISO_MS, comVariacao)));
}

// ── Classificação de erro de envio ───────────────────────────────────────────────────────

export type ResultadoEnvio = "sem_whatsapp" | "chip_caido" | "retentar" | "falha";

/**
 * Sinais que a Evolution/Baileys devolve quando o número simplesmente não existe no WhatsApp.
 * A lista é conservadora de propósito: acrescentar padrão aqui é decisão consciente, porque cada
 * entrada nova é uma forma nova de queimar um item da fila.
 */
const PADROES_SEM_WHATSAPP = [
  "not on whatsapp",
  "does not exist on whatsapp",
  "number does not exist",
  "invalid number",
  "not a valid whatsapp",
];

/** Sinais de que o problema é o NOSSO chip, não o número do outro lado. */
const PADROES_CHIP_CAIDO = [
  "instance not connected",
  "instance does not exist",
  "connection closed",
  "not found instance",
  "unauthorized",
  "logged out",
];

function textoDoCorpo(corpo: unknown): string {
  if (corpo == null) return "";
  if (typeof corpo === "string") return corpo.toLowerCase();
  try {
    return JSON.stringify(corpo).toLowerCase();
  } catch {
    return "";
  }
}

/**
 * O que um envio malsucedido significa.
 *
 * ⚠️ **Falha fechada por construção.** O padrão é `falha` (que retenta) e `sem_whatsapp` exige um
 * match positivo em `PADROES_SEM_WHATSAPP` ou um `exists: false` explícito.
 *
 * Isto é a lição do §36: em 12/08/2026 uma resposta `HTTP 200` com corpo `null` foi lida como
 * "número não existe" e descartou 10 itens da fila, incluindo um número de teste válido.
 * Indisponibilidade **nunca** vira invalidez.
 */
export function classificarErroEnvio(status: number, corpo: unknown): ResultadoEnvio {
  // Rate limit é do nosso lado e é temporário: devolver o item para a fila.
  if (status === 429) return "retentar";

  const texto = textoDoCorpo(corpo);

  // Sinal explícito e estruturado de número inexistente.
  if (corpo && typeof corpo === "object" && (corpo as { exists?: unknown }).exists === false) {
    return "sem_whatsapp";
  }

  // 401 é sessão revogada — o chip morreu, não o número do destinatário.
  if (status === 401) return "chip_caido";

  if (PADROES_CHIP_CAIDO.some((p) => texto.includes(p))) return "chip_caido";
  if (PADROES_SEM_WHATSAPP.some((p) => texto.includes(p))) return "sem_whatsapp";

  return "falha";
}

// ── Estado de conexão → status do chip ───────────────────────────────────────────────────

export type StatusChip = "cadastrado" | "conectado" | "desconectado" | "banido";

/**
 * Traduz o estado que a Evolution reporta para o `status_chip` do nosso banco.
 *
 * O caso que importa é o `401`: `DisconnectReason.loggedOut` significa sessão revogada, e a
 * documentação do Baileys é explícita — reconectar não resolve, precisa de QR novo. Para uma
 * operação com números virtuais, isso na prática é a morte do chip, então vira `banido` e não
 * `desconectado`, para o failover disparar em vez de o sistema ficar tentando reconectar.
 */
export function estadoConexaoParaStatus(estado: string, codigoDesconexao?: number): StatusChip {
  if (estado === "open") return "conectado";
  if (estado === "connecting") return "cadastrado";
  if (codigoDesconexao === 401) return "banido";
  return "desconectado";
}
