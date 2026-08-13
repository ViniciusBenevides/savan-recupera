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
  ].some((padrao) => padrao.test(texto));
  if (negou || /^(?:nao|negativo|numero errado|pessoa errada)$/.test(texto)) return "negou";

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
    /^(?:sim|sou eu|isso|isso mesmo|correto|correta|pode sim|pode falar)(?:\b|$)/,
    /\b(?:sim\s+)?sou eu\b/,
    /^(?:e|eh)\s+(?:ele|ela)(?:\b|$)/,
    new RegExp(`\\b${esperado}\\s+(?:falando|aqui)\\b`),
  ].some((padrao) => padrao.test(texto));
  return confirmou ? "confirmou" : "indefinida";
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
