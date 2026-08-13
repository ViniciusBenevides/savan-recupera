const normalizar = (valor: unknown) => String(valor ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ").trim();

export function ehDuvidaDeOrigem(entrada: unknown): boolean {
  const texto = normalizar(entrada);
  return /\b(?:que|qual|em que)\s+ano\b/.test(texto)
    || /\b(?:quando|quanto tempo)\b.*\b(?:divida|fatura|compra|pendencia)\b/.test(texto)
    || /\bnao\s+(?:lembro|reconheco|recordo)\b/.test(texto)
    || /\b(?:nunca|nao)\s+(?:comprei|fiz compra)\b/.test(texto)
    || /\b(?:compra|fatura|divida|pendencia)\b.*\b(?:savan|savana)\b/.test(texto)
    || /\b(?:golpe|origem da divida|de onde veio)\b/.test(texto);
}

export function cpfMascarado(cpf: unknown): string | null {
  const digitos = String(cpf ?? "").replace(/\D/g, "");
  return digitos.length >= 2 ? `***.***.***-${digitos.slice(-2)}` : null;
}

export function respostaOrigemDeterministica(dados: {
  primeiroNome?: string | null;
  cpf?: string | null;
  processo?: string | null;
  vencimento?: string | null;
}): string {
  const nome = String(dados.primeiroNome ?? "").trim();
  const prefixo = nome ? `${nome}, conferi o registro.` : "Conferi o registro.";
  const cpf = cpfMascarado(dados.cpf);
  let data: string;
  if (dados.vencimento) {
    const dt = new Date(`${dados.vencimento}T00:00:00Z`);
    const hoje = new Date();
    let anos = hoje.getUTCFullYear() - dt.getUTCFullYear();
    const aniversarioPassou = hoje.getUTCMonth() > dt.getUTCMonth()
      || (hoje.getUTCMonth() === dt.getUTCMonth() && hoje.getUTCDate() >= dt.getUTCDate());
    if (!aniversarioPassou) anos--;
    data = `A data de vencimento registrada é ${dt.toLocaleDateString("pt-BR", { timeZone: "UTC" })}, há aproximadamente ${Math.max(0, anos)} ano(s).`;
  } else {
    data = "O cadastro disponível neste atendimento não informa a data da compra, do vencimento ou da distribuição. Por isso, não consigo afirmar o ano nem há quanto tempo a dívida existe sem consultar a documentação de origem.";
  }
  return [
    `${prefixo}${cpf ? ` Ele está vinculado ao CPF ${cpf}.` : ""}${dados.processo ? ` O processo registrado é ${dados.processo}.` : ""}`,
    data,
    "A MC Cred adquiriu a carteira de recebíveis da SAVAN e hoje é a responsável por esta quitação.",
    "Por isso, o pagamento não é feito na loja SAVAN: ele deve ser realizado pelo Pix da MC Cred ou presencialmente no endereço oficial informado neste WhatsApp.",
    "Se você quiser, também posso solicitar o documento de origem para conferência.",
  ].join("\n\n");
}

export function corrigirOrientacaoPagamento(resposta: string): string {
  const texto = String(resposta ?? "").trim();
  const normal = normalizar(texto);
  const autorizouLoja = /\b(?:pagar|pagamento|quite|quitar|fazer o pagamento)\b.*\bloja\b/.test(normal)
    && !/\bnao\s+(?:e\s+feito|pode|deve|pague)\b.*\bloja\b/.test(normal);
  if (!autorizouLoja) return texto;
  return "O pagamento não é feito na loja SAVAN. A MC Cred adquiriu a carteira de recebíveis e hoje é a responsável pela quitação. Você pode pagar pelo Pix da MC Cred ou presencialmente no endereço oficial informado neste WhatsApp.";
}
