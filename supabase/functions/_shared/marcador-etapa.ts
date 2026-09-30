/**
 * O marcador `PROXIMA_ETAPA: <id>` com que o modelo diz para onde a conversa vai (§33).
 *
 * Ele é mecânica interna e NUNCA pode chegar à pessoa. A versão anterior só o reconhecia sozinho
 * numa linha; em 29/09/2026 o modelo escreveu "Posso gerar o código Pix para você quitar?
 * PROXIMA_ETAPA: pagamento" na mesma linha, o marcador foi enviado ao devedor três vezes — e, como
 * não era lido, a conversa ficou presa na etapa em que estava, repetindo respostas fora de contexto.
 *
 * Aqui ele é achado em qualquer posição e nas variações que o modelo produz: negrito, itálico,
 * crase, aspas retas e curvas, `<id>` (o formato do próprio prompt), `->`, travessão, seta, espaço
 * não separável, e id escrito com acento ("sem_condições" → `sem_condicoes`). Qualquer resto do
 * marcador é apagado mesmo quando o id não é válido: falhar fechado aqui é não mostrar a mecânica,
 * nunca mover a conversa para uma etapa que não existe.
 */

// Com sublinhado vale em qualquer caixa — ninguém escreve "proxima_etapa" por acaso. Com espaço, só
// em maiúsculas: "a próxima etapa: gerar o Pix" é português normal e não pode ser apagado.
const NOME = "(?:[Pp][Rr][OoÓó][Xx][Ii][Mm][Aa]_[Ee][Tt][Aa][Pp][Aa]|PR[OÓ]XIMA[ \\t\\u00a0]ETAPA)";
// Quantificadores LIMITADOS de propósito: `*` nas bordas deixava o regex cúbico numa sequência longa
// de espaços (4 mil espaços levavam 15 s, e a Edge Function tem 2 s de CPU).
const ABRE = "[(\\[{<*_`\"“‘'«]{0,3}";
const FECHA = "[*_`\"”’'»)\\]}>]{0,3}";
const ESPACO = "[ \\t\\u00a0]?";
const SEPARADOR = "(?:->|=>|[:=\\-–—→])";
const MARCADOR = new RegExp(
  `${ABRE}${ESPACO}${NOME}[*_\`]{0,3}${ESPACO}${SEPARADOR}${ESPACO}${ABRE}${ESPACO}([A-Za-zÀ-ÿ0-9_\\-]*)${FECHA}\\.?`,
  "g",
);
const TEM_MARCADOR = /pr[oó]xima[_ \t ]etapa/i;

function normalizarId(bruto: string): string {
  return bruto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^[_-]+|[_-]+$/g, "");
}

function limpar(texto: string): string {
  return texto
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function extrairMarcadorEtapa(
  texto: string,
  idsValidos: Set<string>,
): { texto: string; proxima: string | null } {
  const original = String(texto ?? "");
  // Caminho rápido: quase nenhuma resposta tem marcador, e aí o texto sai intacto.
  if (!TEM_MARCADOR.test(original)) return { texto: original.trim(), proxima: null };

  let proxima: string | null = null;
  // Sequências de espaço viram um só antes do regex — a limpeza final já faria isso.
  const semEspacosRepetidos = original.replace(/[ \t ]{2,}/g, " ");
  const limpo = semEspacosRepetidos.replace(MARCADOR, (_m, id: string) => {
    const candidato = normalizarId(String(id ?? ""));
    if (candidato && idsValidos.has(candidato)) proxima = candidato;
    return " ";
  });
  return { texto: limpar(limpo), proxima };
}
