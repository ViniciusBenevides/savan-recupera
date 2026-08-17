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
    // "eu mesmo nao", "eu nao" e "nao esse numero": negativas curtas que o padrao
    // de frase completa nao alcancava e que caiam em "indefinida" ate o limite de
    // tentativas encerrar a conversa como se a pessoa tivesse ficado calada.
    /\beu\s+mesm[oa]\s+nao\b/,
    /\bnao\s+(?:esse|este)\s+(?:numero|telefone)\b/,
    /\bnem\s+(?:conheco|sei\s+quem)\b/,
    /^nao(?:\s+nao)+$/,
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
    /\b(?:sou|e|eh|eo|ea)\s+(?:a\s+|o\s+)?(?:irma|irmao|mae|pai|filha|filho|esposa|marido|ex\s+esposa|ex\s+marido|tia|tio|sobrinha|sobrinho|cunhada|cunhado|neta|neto|nora|genro|amiga|amigo|vizinha|vizinho|patroa|patrao|secretaria)\s+d(?:ele|ela)\b/,
    /\b(?:aqui|aqui\s+quem\s+fala)\s+(?:e|eh|eo|ea)\s+(?:o\s+|a\s+)?(?:filho|filha|irma|irmao|mae|pai|esposa|marido)\b/,
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
    // "para" so vale como imperativo quando vier seguido de "de" ("para de me mandar").
    // Aceitar "para" solto casava com a PREPOSICAO — "eu pego para ela fazer o pagamento ...
    // o outro negocio ai PARA MANDAR" registrava opt-out de alguem prestes a pagar.
    /\b(?:pare|parem|cessa|cessem|chega)\s+(?:de\s+)?(?:me\s+)?(?:mandar|enviar|ligar|cobrar|contatar|incomodar|perturbar)/,
    /\bpara\s+de\s+(?:me\s+)?(?:mandar|enviar|ligar|cobrar|contatar|incomodar|perturbar)/,
    /\bchega\s+de\s+(?:mensagem|mensagens|cobranca|ligacao|ligacoes)\b/,
    /\b(?:retire|retira|retirar|retirem|retirad[oa]|tire|tira|tirar|tirem|remova|remove|remover|removam|removid[oa]|exclua|exclui|excluir|excluam|excluid[oa]|apague|apaga|apagar|apaguem|desvincule|desvincula|desvincular|descadastre|descadastra|descadastrad[oa])\b.*\b(?:meu\s+|esse\s+|este\s+|do\s+|da\s+)?(?:numero|telefone|contato|cadastro|lista|base)\b/,
    /\b(?:me\s+)?(?:tira|tire|retira|remove|remova)\b.*\b(?:dessa|desta|da)\s+(?:lista|base|cobranca)\b/,
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

// Um terceiro que se oferece para repassar o contato (ou que ja manda o numero) e boa vontade —
// mas coletar telefone de titular por essa via nao tem base legal, e continuar a conversa como se
// nada tivesse acontecido revela o assunto a quem nao e o titular. Vira encerramento com
// agradecimento, sem registrar o dado oferecido.
export function ehIndicacaoDeContatoDeTerceiro(entrada: unknown): boolean {
  const texto = normalizar(entrada);
  const soDigitos = String(entrada ?? "").replace(/\D/g, "");
  const mandouNumero = soDigitos.length >= 10 && soDigitos.length <= 13
    && normalizar(entrada).replace(/\d/g, "").trim().length <= 12;
  return mandouNumero
    || /\b(?:vou|irei|posso|deixa\s+eu)\s+(?:te\s+|lhe\s+|ja\s+)?(?:passar|repassar|encaminhar|mandar|enviar)\b.*\b(?:contato|numero|telefone|zap|whats)\b/.test(texto)
    || /\b(?:esse|este|ai|aqui)\b.*\b(?:e|eh)\s+o\s+(?:contato|numero|telefone)\s+d(?:ele|ela)\b/.test(texto)
    || /\b(?:o|os)\s+(?:contato|numero|telefone)\s+d(?:ele|ela)\s+(?:e|eh)\b/.test(texto)
    || /\b(?:fala|fale|liga|ligue|chama|chame|procura|procure)\b.*\bcom\s+(?:ele|ela)\b.*\b(?:no|pelo)\s+(?:numero|telefone|zap)\b/.test(texto)
    || /\b(?:vou|irei)\s+(?:avisar|falar\s+com|passar\s+(?:pra|para))\s+(?:ele|ela)\b/.test(texto);
}

// Falecimento do titular. Precede qualquer outra regra depois do nao-perturbe: nenhuma mensagem
// sobre valor, divida ou proposta pode sair depois disto.
export function ehAvisoDeFalecimento(entrada: unknown): boolean {
  const texto = normalizar(entrada);
  return /\b(?:faleceu|falecida|falecido|morreu|obito|e\s+falecid[oa]|ja\s+morreu|nos\s+deixou)\b/.test(texto)
    || /\b(?:in\s+memoriam|descansou\s+em\s+paz)\b/.test(texto);
}

// Resposta automatica de outra empresa (menu, horario de funcionamento, saudacao comercial).
// Nao ha pessoa lendo: tratar como resposta humana gera dialogos absurdos e revela o assunto a
// um canal comercial de terceiro.
export function ehAutorespostaComercial(entrada: unknown): boolean {
  const texto = normalizar(entrada);
  if (texto.length < 25) return false;
  const marcadores = [
    /\bagradec(?:e|emos)\s+(?:o\s+)?(?:seu\s+)?(?:contato|a\s+sua\s+mensagem)\b/,
    /\bseja\s+bem\s+vind[oa]\b/,
    /\bhorario\s+de\s+(?:funcionamento|atendimento)\b/,
    /\bnao\s+estamos\s+disponiveis\s+no\s+momento\b/,
    /\bresponderemos\s+assim\s+que\s+(?:possivel|poss)\b/,
    /\bcomo\s+podemos\s+(?:te\s+)?(?:ajudar|atender|tornar\s+seu\s+dia)\b/,
    /\bem\s+que\s+posso\s+ajudar\b.*\b(?:clinica|loja|empresa|atendimento)\b/,
    /\bseu\s+atendimento\s+se\s+inicia\b/,
    /\bdigite\s+(?:uma\s+)?(?:opcao|o\s+numero)\b/,
    /\bqual\s+o\s+seu\s+nome\s+completo\s+e\s+como\s+podemos\b/,
  ];
  return marcadores.filter((padrao) => padrao.test(texto)).length >= 1
    && /\b(?:clinica|loja|empresa|criatorio|atendimento|unidade|decor|studio|salao|escritorio|comercial|de\s+segunda\s+a\s+sexta)\b/.test(texto);
}

// Advogado, Procon, justica, delegacia ou acusacao formal de cobranca indevida. Encerra o
// atendimento automatico na hora: argumentar aqui e o pior desfecho possivel.
export function ehMencaoJuridica(entrada: unknown): boolean {
  const texto = normalizar(entrada);
  return /\b(?:advogad[oa]|procon|defensoria|juizado|justica|judicial|delegacia|boletim\s+de\s+ocorrencia|ministerio\s+publico)\b/.test(texto)
    || /\b(?:vou|irei|pretendo)\s+(?:processar|denunciar|acionar|dar\s+parte|entrar\s+na\s+justica|abrir\s+processo)\b/.test(texto)
    || /\b(?:dar|dou)\s+parte\b/.test(texto)
    || /\bcobranca\s+indevida\b/.test(texto)
    || /\b(?:vou|irei)\s+atras\s+dos\s+meus\s+direitos\b/.test(texto);
}

// Emoji solto, figurinha, teclado apertado sem querer ou audio transcrito sem sentido. Nao conta
// como tentativa de identidade — insistir com a mesma pergunta e o que fez conversas reais
// repetirem a mesma frase quatro vezes.
export function ehMensagemSemConteudo(entrada: unknown): boolean {
  const bruto = String(entrada ?? "").trim();
  if (!bruto) return true;
  const texto = normalizar(bruto);
  if (!texto) return true;
  if (/^(?:k{2,}|h{2,}|a{3,}|rs{1,}|ha(?:ha)+)$/.test(texto.replace(/\s+/g, ""))) return true;
  if (texto.length <= 2) return true;
  // Teclado apertado sem querer: palavra unica e longa com densidade de vogal impossivel em
  // portugues ("Jjjkjkkko"). Deliberadamente conservador — uma transcricao de audio ruim que
  // *pareca* uma palavra (um nome, por exemplo) segue o caminho normal de identidade, porque o
  // custo de tratar um nome real como ruido e maior que o de perguntar mais uma vez.
  const palavras = texto.split(" ").filter(Boolean);
  if (palavras.length === 1 && palavras[0].length >= 6) {
    const vogais = (palavras[0].match(/[aeiou]/g) ?? []).length;
    return vogais / palavras[0].length < 0.25;
  }
  return false;
}

export function respostaTerceiroIndicaContato(): string {
  return "Obrigado pela gentileza, de verdade 🙏 Só que, por proteção de dados, eu não posso tratar desse assunto nem anotar contatos através de outra pessoa. Se ela quiser, pode falar direto com a MC Cred pelo canal oficial que aparece neste perfil. Vou retirar este número do cadastro para não te incomodar mais. Tenha um ótimo dia!";
}

export function respostaFalecimento(): string {
  return "Sinto muito pela sua perda. Vou encerrar este cadastro e retirar o número dos nossos contatos agora mesmo — vocês não receberão mais mensagens nossas. Meus sentimentos à família.";
}

export function respostaMencaoJuridica(): string {
  return "Entendi e registrei sua manifestação. Encerro o atendimento automático agora e encaminho o caso para a equipe responsável da MC Cred, que assume daqui em diante. Você não receberá mais mensagens automáticas sobre este assunto.";
}

export function respostaAutorespostaComercial(nome: unknown): string {
  return `Olá! Acho que cheguei ao número errado. Estou procurando uma pessoa física, ${nomeCompletoLegivel(nome)}. Se este número não for dela, me avisa que eu retiro do cadastro na hora.`;
}

export function respostaMensagemSemConteudo(nome: unknown): string {
  return `Acho que a mensagem chegou cortada por aqui 😅 Se puder, me responde por escrito só um sim ou não: falo com ${nomeCompletoLegivel(nome)}?`;
}

export function ehRecusaSimplesNegociacao(entrada: unknown): boolean {
  const texto = normalizar(entrada);
  return /^(?:nao|nao obrigado|nao obrigada|nao quero|deixa pra la|sem interesse|agora nao)$/.test(texto);
}

// Contar as perguntas de identidade JA FEITAS e o que garante o limite de duas tentativas.
// Duas das seis frases geradas por respostaConfirmacaoIdentidade ("...voce confirma se e X?")
// nao casavam com nenhum padrao daqui: a contagem ficava em zero, o limite nunca era atingido e
// a mesma frase saia repetida ate a pessoa acusar golpe. Todo formato emitido por esta funcao
// precisa ser reconhecido por aqui — o teste identity.test.ts trava essa correspondencia.
export function ehPerguntaDeIdentidade(conteudo: unknown): boolean {
  const texto = normalizar(conteudo);
  return /\b(?:falo|falando|estou falando)\s+com\b/.test(texto)
    || /\bvoce\s+(?:e|eh)\b/.test(texto)
    || /\bvoce\s+confirma\b/.test(texto)
    || /\b(?:preciso|so preciso)\s+confirmar\b/.test(texto)
    || /\bconfirmar\s+(?:a\s+)?identidade\b/.test(texto)
    || /\bpreservar\s+os\s+dados\b/.test(texto)
    || texto.includes("falo com a pessoa certa");
}

export type PeriodoDoDia = "manha" | "tarde" | "noite";

// A saudacao correta e a do RELOGIO, nao a que a pessoa escreveu. Responder "Bom dia" as tres da
// tarde porque a pessoa digitou "bom dia" foi um dos tiques que denunciavam o robo.
export function periodoDoDia(agora: Date = new Date(), tz = "America/Sao_Paulo"): PeriodoDoDia {
  const hora = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", hour12: false,
  }).format(agora));
  if (hora < 12) return "manha";
  if (hora < 18) return "tarde";
  return "noite";
}

export function saudacaoDoPeriodo(periodo: PeriodoDoDia): string {
  return periodo === "manha" ? "Bom dia" : periodo === "tarde" ? "Boa tarde" : "Boa noite";
}

export function respostaConfirmacaoIdentidade(
  nome: unknown,
  tentativa: number,
  entrada: unknown,
  jaEnviadas: string[] = [],
  periodo: PeriodoDoDia = periodoDoDia(),
): string {
  const nomeCompleto = nomeCompletoLegivel(nome);
  const texto = normalizar(entrada);
  const cumprimentou = /\b(?:oi|ola|opa|bom dia|boa tarde|boa noite)\b/.test(texto);
  const saudacao = cumprimentou ? `${saudacaoDoPeriodo(periodo)}! ` : "";
  const opcoes = [
    `${saudacao}Antes de continuar, só preciso confirmar: falo com ${nomeCompleto}?`,
    `${saudacao}Para eu não passar informação à pessoa errada, me confirma: você é ${nomeCompleto}?`,
    `${saudacao}Obrigado pelo retorno. Posso confirmar que estou falando com ${nomeCompleto}?`,
  ];
  const usadas = new Set(jaEnviadas.map((t) => normalizar(t)));
  const inicio = Math.abs(Math.trunc(tentativa || 0)) % opcoes.length;
  for (let i = 0; i < opcoes.length; i++) {
    const candidata = opcoes[(inicio + i) % opcoes.length];
    if (!usadas.has(normalizar(candidata))) return candidata;
  }
  return opcoes[inicio];
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
