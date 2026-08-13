const ESTADOS_TERMINAIS = new Set(["encerrada", "optout", "pago"]);

export function ehEstadoTerminal(estado: unknown): boolean {
  return ESTADOS_TERMINAIS.has(String(estado ?? ""));
}
