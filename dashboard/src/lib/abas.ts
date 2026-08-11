/**
 * Contrato das abas — módulo NEUTRO (sem "use client"), porque quem monta a lista de abas e
 * resolve qual está ativa são as pages, que rodam no servidor.
 *
 * As duas metades têm de morar em arquivos diferentes:
 *  - o tipo/`resolverAba` aqui, chamável do servidor;
 *  - o `<Abas>` em components/Abas.tsx ("use client"), que precisa de useSearchParams.
 * Misturar os dois faz o servidor tentar chamar uma função marcada como client
 * ("Attempted to call resolverAba() from the server").
 *
 * O ícone viaja como NOME, não como componente: função não atravessa a fronteira
 * server→client — passar o componente compila e depois estoura em toda requisição.
 */
export type NomeIcone =
  | "Gauge" | "HandCoins" | "LineChart" | "FolderUp" | "Users" | "MessagesSquare"
  | "Headset" | "MessageSquareText" | "Bot" | "BookOpen" | "Send" | "Smartphone"
  | "Plug" | "UserCog" | "LifeBuoy" | "FileBadge";

export type Aba = { k: string; t: string; icon?: NomeIcone };

/** Resolve a aba pedida na URL contra as abas que o papel do usuário realmente pode ver. */
export function resolverAba<T extends { k: string }>(abas: T[], pedida?: string): string {
  return abas.some((a) => a.k === pedida) ? pedida! : abas[0].k;
}
