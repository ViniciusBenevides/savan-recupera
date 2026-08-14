export type ClassificacaoIdentidade = "confirmou" | "negou" | "indefinida";

export function normalizar(v: unknown): string {
  return String(v ?? "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function primeiroNomeLegivel(nome: unknown): string {
  const primeiro = String(nome ?? "").trim().split(/\s+/)[0] || "a pessoa procurada";
  if (primeiro === "a") return "a pessoa procurada";
  return primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR");
}

export function nomeCompletoLegivel(nome: unknown): string {
  const partes = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "a pessoa procurada";
  const conectivos = new Set(["da", "das", "de", "do", "dos", "e"]);
  return partes.map((parte, indice) => {
    const minuscula = parte.toLocaleLowerCase("pt-BR");
    if (indice > 0 && conectivos.has(minuscula)) return minuscula;
    return minuscula.charAt(0).toLocaleUpperCase("pt-BR") + minuscula.slice(1);
  }).join(" ");
}

export function classificarRespostaIdentidade(
  entrada: unknown,
  nomeEsperado: unknown,
): ClassificacaoIdentidade {
  const texto = normalizar(entrada);
  const esperado = normalizar(primeiroNomeLegivel(nomeEsperado)).split(" ")[0];
  if (!texto) return "indefinida";

  // Negacao tem precedencia: frases como "nao sou eu, meu nome e Roberto"
  // podem conter palavras que, isoladas, pareceriam confirmacao.
  const negou = [
    /\bnao\s+(?:sou|era)\s+(?:eu|ele|ela|o|a)\b/,
    /\bnao\s+(?:e|eh)\s+(?:ele|ela|o|a|esse|essa)\b/,
    new RegExp(`\\bnao\\s+(?:e|eh)\\s+(?:o\\s+|a\\s+)?${esperado}\\b`),
    /\bnao\s+(?:e|eh)\s+comigo\b/,
    /\b(?:ele|ela)\s+nao\s+(?:esta|mora|usa|fala)\b/,
    /\b(?:ele|ela)\s+(?:e|eh)\s+(?:meu|minha)\s+(?:marido|esposa|filho|filha|irmao|irma|pai|mae)\b/,
    /\b(?:esse|este)\s+(?:numero|telefone|whatsapp)\s+nao\s+(?:e|eh|pertence)\b/,
    /\b(?:numero|telefone|whatsapp)\s+(?:errado|enganado|trocado|reciclado)\b/,
    /\b(?:pessoa|contato|destinatario)\s+errad[oa]\b/,
    /\b(?:ligou|ligaram|mandou|mandaram|enviou|enviaram|chamou|chamaram)\s+errado\b/,
    /\bnao\s+(?:conheco|conheci|sei\s+quem\s+e)\b/,
    /\bdesconheco\b/,
    /\bnunca\s+(?:ouvi\s+falar|vi)\b/,
    /\b(?:aqui|neste\s+numero)\s+nao\s+tem\b/,
    /\bnao\s+tem\s+(?:ninguem|nenhuma\s+pessoa)\b.*\b(?:nome|aqui|aki)\b/,
    /\b(?:sou|e|eh)\s+(?:a\s+|o\s+)?(?:irma|irmao|mae|pai|filha|filho|esposa|marido|tia|tio|sobrinha|sobrinho|cunhada|cunhado|amiga|amigo|vizinha|vizinho)\s+d(?:ele|ela)\b/,
    /\b(?:vou|irei|posso)\s+(?:passar|encaminhar|repassar|avisar)\b.*\b(?:contato|mensagem|recado)\b.*\bd(?:ele|ela)\b/,
    /\b(?:fale|fala|mande|manda|envie|envia)\b.*\b(?:para|pro|pra)\s+(?:ele|ela)\b/,
  ].some((padrao) => padrao.test(texto));
  if (negou || /^(?:(?:oi|ola|bom dia|boa tarde|boa noite)\s+)?(?:nao|negativo|numero errado|pessoa errada)$/.test(texto)) return "negou";

  // Se a pessoa se apresenta com outro primeiro nome, a identidade esta negada
  // mesmo sem usar a palavra "nao".
  const apresentacao = texto.match(
    /\b(?:(?:eu\s+)?me\s+chamo|meu\s+nome\s+e|aqui\s+(?:e|fala)|eu\s+sou|sou)\s+(?:o\s+|a\s+)?([a-z]{2,})\b/,
  );
  const outraApresentacao = texto.match(
    /\b(?:voce\s+esta\s+falando\s+com|esta\s+falando\s+com|falando\s+com)\s+([a-z]{2,})\b/,
  ) ?? texto.match(/^([a-z]{2,})\s+(?:falando|aqui)$/);
  const nomeInformado = apresentacao?.[1] ?? outraApresentacao?.[1];
  if (nomeInformado && !["eu", "ele", "ela", "sim"].includes(nomeInformado)) {
    return nomeInformado === esperado ? "confirmou" : "negou";
  }

  const confirmou = [
    /^(?:sim|sou eu|isso|isso mesmo|correto|correta)(?:\b|$)/,
    /\b(?:sim\s+)?sou eu\b/,
    /^(?:e|eh)\s+(?:ele|ela)(?:\b|$)/,
    new RegExp(`\\b${esperado}\\s+(?:falando|aqui)\\b`),
  ].some((padrao) => padrao.test(texto));
  return confirmou ? "confirmou" : "indefinida";
}

export function ehPedidoNaoPerturbe(entrada: unknown): boolean {
  const texto = normalizar(entrada);
  return [
    /\bnao\s+(?:me\s+)?(?:manda|mande|mandar|envia|envie|enviar|liga|ligue|ligar|chama|chame|chamar|contata|contate|contatar|cobra|cobre|cobrar)\b.*\b(?:mais|novamente|de novo)\b/,
    /\bnao\s+quero\s+(?:mais\s+)?(?:receber|ser\s+contatad[oa]|mensagem|ligacao|cobranca)/,
    /\b(?:pare|para|parem|cessar|cessem)\s+(?:de\s+)?(?:me\s+)?(?:mandar|enviar|ligar|cobrar|contatar)/,
    /\b(?:retire|retira|remova|remove|exclua|exclui|apague|apaga|desvincule|desvincula)\b.*\b(?:meu\s+)?(?:numero|telefone|contato|cadastro)\b/,
    /\b(?:bloqueie|bloqueia)\b.*\b(?:meu\s+)?(?:numero|telefone|contato)\b/,
    /\bnao\s+autorizo\b.*\b(?:contato|mensagem|ligacao|cobranca)/,
  ].some((padrao) => padrao.test(texto));
}

export function ehObjecaoConfirmacaoIdentidade(entrada: unknown): boolean {
  const texto = normalizar(entrada);
  return /\b(?:sobre|do)\s+que\b/.test(texto)
    || /\bqual\s+(?:e|eh)\s+(?:o\s+)?assunto\b/.test(texto)
    || /\bque\s+(?:e|eh)\s+o\s+assunto\b/.test(texto)
    || /\bcomo\s+(?:e|eh)\s+que\s+eu\s+vou\s+confirmar\b/.test(texto)
    || /\bnao\s+(?:vou|quero)\s+confirmar\b/.test(texto)
    || /\b(?:mande|manda|explique|explica|fale|fala)\b.*\b(?:primeiro|antes|assunto|devendo|divida)\b/.test(texto)
    || /\b(?:golpe|fraude|suspeito|estranho)\b/.test(texto);
}

export function ehPedidoDocumentoOrigem(entrada: unknown): boolean {
  const texto = normalizar(entrada);
  return /\b(?:comprovante|documento|contrato|nota fiscal|cupom|carne|duplicata)\b/.test(texto)
    && /\b(?:compra|divida|debito|pendencia|origem|savan|conta|cobranca)\b/.test(texto);
}

export function ehPerguntaOrigemContato(entrada: unknown): boolean {
  const texto = normalizar(entrada);
  return /\bcomo\b.*\b(?:conseguiu|conseguiram|obteve|obtiveram|achou|acharam|pegou|pegaram)\b.*\b(?:meu\s+)?(?:numero|telefone|contato|dados)\b/.test(texto)
    || /\b(?:de onde|onde)\b.*\b(?:tirou|tiraram|veio|conseguiu|conseguiram)\b.*\b(?:meu\s+)?(?:numero|telefone|contato|dados)\b/.test(texto);
}

export function ehRecusaSimplesNegociacao(entrada: unknown): boolean {
  const texto = normalizar(entrada);
  return /^(?:nao|nao obrigado|nao obrigada|nao quero|deixa pra la|sem interesse|agora nao)$/.test(texto);
}

export function ehPerguntaDeIdentidade(conteudo: unknown): boolean {
  const texto = normalizar(conteudo);
  return /\b(?:falo|falando|estou falando)\s+com\b/.test(texto)
    || /\bvoce\s+(?:e|eh)\b/.test(texto)
    || /\b(?:preciso|so preciso)\s+confirmar\b/.test(texto)
    || texto.includes("falo com a pessoa certa");
}

export function respostaConfirmacaoIdentidade(
  nome: unknown,
  tentativa: number,
  entrada: unknown,
): string {
  const nomeCompleto = nomeCompletoLegivel(nome);
  const texto = normalizar(entrada);
  const saudacao = texto.includes("bom dia") ? "Bom dia! "
    : texto.includes("boa tarde") ? "Boa tarde! "
    : texto.includes("boa noite") ? "Boa noite! "
    : /\b(?:oi|ola|opa)\b/.test(texto) ? "Olá! "
    : "";
  const opcoes = saudacao
    ? [
      `${saudacao}Antes de continuar, só preciso confirmar: estou falando com ${nomeCompleto}?`,
      `${saudacao}Claro. Para preservar os dados, você confirma se é ${nomeCompleto}?`,
      `${saudacao}Obrigado pelo retorno. Posso confirmar que falo com ${nomeCompleto}?`,
    ]
    : [
      `Só para eu não passar nenhuma informação à pessoa errada: estou falando com ${nomeCompleto}?`,
      `Antes de seguir, preciso confirmar a identidade. Você é ${nomeCompleto}?`,
      `Para preservar os dados, você confirma se é ${nomeCompleto}?`,
    ];
  return opcoes[Math.abs(Math.trunc(tentativa || 0)) % opcoes.length];
}

export function respostaPessoaErrada(semente: number): string {
  const opcoes = [
    "Entendi, obrigado por avisar. Vou desvincular este número do contato da pessoa procurada e encerrar por aqui. Desculpe pelo incômodo.",
    "Certo, agradeço por esclarecer. Já sinalizei que este telefone não pertence à pessoa procurada. Não enviaremos novas mensagens destinadas a ela por este número.",
    "Obrigado pela informação. Vou retirar este número do cadastro de contato da pessoa procurada. Peço desculpas pelo transtorno.",
  ];
  return opcoes[Math.abs(Math.trunc(semente || 0)) % opcoes.length];
}

export function respostaNaoPerturbe(): string {
  return "Entendi. Registrei que este número não quer receber novas mensagens e encerrei o contato automático. Desculpe pelo incômodo.";
}

export function respostaContextoSeguroIdentidade(nome: unknown): string {
  return `Entendo a cautela. É um contato da MC Cred relacionado a um atendimento da SAVAN Calçados. Não envie documento, foto, CPF, senha ou código. Para eu saber se posso continuar sem expor dados, responda apenas se você é ${nomeCompletoLegivel(nome)}: sim ou não.`;
}

export function respostaLimiteIdentidade(): string {
  return "Como não foi possível confirmar a identidade, encerrei este atendimento automático e não vou informar dados da conta por aqui. Se a mensagem era para você e quiser verificar, procure a MC Cred pelo canal oficial exibido neste perfil.";
}
