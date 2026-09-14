// SAVAN Recupera — quebra de mensagens em balões ("split de mensagens")
//
// Vem do desenho da Secretária v3 (fazer.ai) — ver
// `Guias Operacionais/Secretária v3 e v4 (fazer.ai) — O que aproveitar no nosso fluxo.md` §5.
// Lá a quebra é feita por uma chamada de LLM com output estruturado. Aqui é DETERMINÍSTICA de
// propósito: uma chamada de modelo a mais por turno custa dinheiro, adiciona latência antes da
// primeira mensagem e cria um jeito novo de o bot falar errado. As regras abaixo são as mesmas
// que o prompt deles pede — só que sem sorteio.
//
// ⚠️ Quem NÃO deve passar por aqui: o copia-e-cola do Pix. Ele vai sozinho, inteiro, na última
// mensagem, para a pessoa copiar com um toque. Quebrar um payload Pix o inutiliza.

/** Nº máximo de balões por resposta. Regra da v3: nunca mais de 5. */
export const MAX_BALOES = 5;

/** Abaixo disso não vale quebrar — já é uma mensagem de WhatsApp. */
const MIN_CHARS_PARA_QUEBRAR = 180;

/** Nenhum balão fica menor que isto; pedaços curtos são reabsorvidos pelo anterior. */
const MIN_CHARS_BALAO = 40;

/** Palavras por minuto que a "digitação" simula. Mesmo valor da v3. */
export const PALAVRAS_POR_MINUTO = 150;

/** Tamanho médio de uma palavra em português, em caracteres. Mesmo valor da v3. */
const CHARS_POR_PALAVRA = 4.5;

/** Teto do "digitando" por balão, em segundos. Sem isso um texto longo trava a conversa. */
const TETO_DIGITANDO_S = 25;

/**
 * Um payload Pix copia-e-cola (BR Code / EMV). Começa em "000201" e é uma linha longa sem
 * espaços. Nunca pode ser quebrado nem reformatado.
 */
export function ehPixCopiaCola(texto: string): boolean {
  const t = texto.trim();
  return t.startsWith("000201") && t.length > 60 && !/\s/.test(t);
}

/** Uma linha de lista: "1. ", "2) ", "- ", "• ". Listas não podem ser quebradas entre balões. */
function ehLinhaDeLista(linha: string): boolean {
  return /^\s*(\d+[.)]\s|[-*•]\s)/.test(linha);
}

/**
 * Quanto tempo o "digitando..." deve durar para este balão, em segundos.
 * Fórmula da v3: 60 * (chars / 4.5) / 150, com teto de 25s.
 */
export function segundosDigitando(texto: string): number {
  const palavras = texto.length / CHARS_POR_PALAVRA;
  return Math.min((60 * palavras) / PALAVRAS_POR_MINUTO, TETO_DIGITANDO_S);
}

/**
 * Quebra UM texto em balões. Nunca reescreve nem reordena — só corta em fronteiras naturais.
 *
 * Ordem das fronteiras, da mais forte para a mais fraca:
 *   1. parágrafo (linha em branco)
 *   2. fim de frase (. ! ? … seguidos de espaço)
 *
 * Blocos de lista viajam inteiros, colados ao parágrafo que os introduz quando couber.
 */
export function quebrarEmBaloes(texto: string): string[] {
  const limpo = texto.trim();
  if (!limpo) return [];
  if (ehPixCopiaCola(limpo)) return [limpo];
  if (limpo.length < MIN_CHARS_PARA_QUEBRAR) return [limpo];

  // 1. parágrafos, preservando blocos de lista inteiros
  const paragrafos: string[] = [];
  let listaAberta: string[] = [];
  const fecharLista = () => {
    if (!listaAberta.length) return;
    const bloco = listaAberta.join("\n");
    // cola a lista no parágrafo que a introduz (normalmente termina em ":")
    const anterior = paragrafos[paragrafos.length - 1];
    if (anterior && anterior.trimEnd().endsWith(":")) paragrafos[paragrafos.length - 1] = `${anterior}\n${bloco}`;
    else paragrafos.push(bloco);
    listaAberta = [];
  };
  for (const bruto of limpo.split(/\n\s*\n/)) {
    const bloco = bruto.trim();
    if (!bloco) continue;
    for (const linha of bloco.split("\n")) {
      if (ehLinhaDeLista(linha)) { listaAberta.push(linha); continue; }
      fecharLista();
      const ultimo = paragrafos.length - 1;
      if (paragrafos[ultimo] && !bloco.includes("\n")) paragrafos.push(linha.trim());
      else paragrafos.push(linha.trim());
    }
    fecharLista();
  }
  fecharLista();

  // 2. se ainda houver poucos pedaços e algum for longo, corta o mais longo em frases
  let partes = paragrafos.filter(Boolean);
  while (partes.length < MAX_BALOES) {
    let alvo = -1;
    for (let i = 0; i < partes.length; i++) {
      if (partes[i].includes("\n")) continue;                     // não fatia bloco de lista
      if (partes[i].length < MIN_CHARS_PARA_QUEBRAR) continue;
      if (alvo === -1 || partes[i].length > partes[alvo].length) alvo = i;
    }
    if (alvo === -1) break;
    // Corta só quando a pontuação é SEGUIDA de espaço e maiúscula — ou seja, fim de frase de
    // verdade. Sem isso o ponto de milhar vira fronteira e "R$ 1.230,40" sai partido ao meio
    // como "R$ 1." + "230,40", que é valor de dívida corrompido na tela da pessoa.
    const frases = partes[alvo]
      .split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ0-9])/)
      .map((f) => f.trim())
      .filter(Boolean);
    if (frases.length < 2) break;
    // divide as frases em duas metades de tamanho parecido
    const meta = partes[alvo].length / 2;
    let acc = 0, corte = 0;
    for (let i = 0; i < frases.length - 1; i++) {
      acc += frases[i].length + 1;
      corte = i + 1;
      if (acc >= meta) break;
    }
    partes.splice(alvo, 1, frases.slice(0, corte).join(" "), frases.slice(corte).join(" "));
  }

  // 3. reabsorve pedaços curtos demais
  for (let i = partes.length - 1; i > 0; i--) {
    if (partes[i].length >= MIN_CHARS_BALAO) continue;
    // quebra de linha só quando algum dos lados é bloco de lista; senão o balão vira um
    // parágrafo com enter no meio, que é justamente o que não parece gente digitando
    const cola = partes[i - 1].includes("\n") || partes[i].includes("\n") ? "\n" : " ";
    partes[i - 1] = `${partes[i - 1]}${cola}${partes[i]}`.trim();
    partes.splice(i, 1);
  }

  // 4. respeita o teto juntando o excedente no último balão
  if (partes.length > MAX_BALOES) {
    const cauda = partes.splice(MAX_BALOES - 1);
    partes.push(cauda.join("\n"));
  }

  return partes.filter(Boolean);
}

/**
 * Aplica a quebra a uma lista de respostas do bot, preservando a ordem.
 * O Pix copia-e-cola atravessa intacto.
 */
export function splitRespostas(respostas: string[]): string[] {
  const saida: string[] = [];
  for (const r of respostas) saida.push(...quebrarEmBaloes(r));
  return saida;
}
