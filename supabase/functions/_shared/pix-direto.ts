/**
 * "QUERO PAGAR" em resposta à primeira mensagem: o Pix sai direto, sem passar pela IA e SEM
 * confirmar a identidade.
 *
 * Por que sem confirmar: identidade confirmada é o que libera CPF, origem da dívida e documentos
 * (`consultar_origem`). Um número reciclado que responda "quero pagar" tem de receber um Pix — que
 * não revela nada além do valor já dito na abertura —, não os dados de outra pessoa. A pergunta
 * "falo com Fulano?" continua valendo para qualquer outra coisa que a pessoa pedir depois.
 *
 * A mensagem é fixa, e não da IA, pelo mesmo motivo: sem a IA não há como ela citar o que não devia.
 */

export function formatarReais(valor: unknown): string {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function respostaPixDireto(o: {
  valor: string;
  validoAte?: string | null;
  // Espelha `responder_prescricao_honestamente` dos guardrails da carteira: quem pula a conversa
  // e vai direto ao Pix nunca ouviu que a conta pode estar prescrita e que pagar é voluntário.
  avisarVoluntario: boolean;
}): string {
  const validade = o.validoAte ? `, válido até ${o.validoAte}` : "";
  const voluntario = o.avisarVoluntario
    ? " Só para deixar claro: por ser uma conta antiga, ela pode estar prescrita, e o pagamento é voluntário."
    : "";
  return `Combinado! Gerei o Pix de ${o.valor}${validade}. O código vai na próxima mensagem, sozinho, `
    + `para você copiar com um toque.${voluntario} Assim que o pagamento for confirmado, o termo de `
    + `quitação chega aqui automaticamente.`;
}
