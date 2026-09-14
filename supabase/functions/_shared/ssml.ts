// SAVAN Recupera — normalização de texto para voz (SSML / pt-BR)
//
// Vem do node "Formatar SSML" da Secretária v3 (fazer.ai), onde a conversão é feita por uma
// chamada de LLM. Aqui é DETERMINÍSTICA pelo mesmo motivo do split (ver `split-mensagens.ts`) e
// por um motivo a mais, que é específico da cobrança: **o bot fala valor de dívida**. Um modelo
// que "quase sempre" lê o número certo não serve — R$ 1.230,40 lido como "mil duzentos e trinta"
// é informação errada sobre dinheiro, dita a uma pessoa real, sem desfazer.
//
// ⚠️ O que NUNCA deve chegar aqui: o copia-e-cola do Pix, CPF completo e qualquer documento.
// Esses vão como texto, na tela. Ver `Guias Operacionais/ElevenLabs — Guia Operacional.md` §6.

const UNIDADES = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = [
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const DEZENAS = [
  "", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa",
];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** 0–999 por extenso. */
function ate999(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto >= 20) {
    const d = Math.floor(resto / 10), u = resto % 10;
    partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
  } else if (resto >= 10) {
    partes.push(DEZ_A_DEZENOVE[resto - 10]);
  } else if (resto > 0) {
    partes.push(UNIDADES[resto]);
  }
  return partes.join(" e ");
}

/** Inteiro não negativo por extenso, até bilhões. Suficiente com folga para uma dívida. */
export function inteiroPorExtenso(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zero";
  const blocos: Array<[number, string, string]> = [
    [1_000_000_000, "bilhão", "bilhões"],
    [1_000_000, "milhão", "milhões"],
    [1_000, "mil", "mil"],
  ];
  const partes: string[] = [];
  let resto = n;
  for (const [valor, sing, plur] of blocos) {
    const q = Math.floor(resto / valor);
    if (!q) continue;
    resto %= valor;
    if (valor === 1_000) partes.push(q === 1 ? "mil" : `${ate999(q)} mil`);
    else partes.push(`${ate999(q)} ${q === 1 ? sing : plur}`);
  }
  if (resto) {
    // "mil e duzentos", mas "mil duzentos e trinta" — o "e" só entra quando o resto é
    // menor que 100 ou múltiplo redondo de 100
    const conector = partes.length && (resto < 100 || resto % 100 === 0) ? " e " : " ";
    partes.push(conector.trim() === "e" ? `e ${ate999(resto)}` : ate999(resto));
    return partes.join(" ").replace(/\s+/g, " ");
  }
  return partes.join(" e ");
}

/** Valor em reais por extenso: 1230.4 -> "mil duzentos e trinta reais e quarenta centavos". */
export function reaisPorExtenso(valor: number): string {
  const negativo = valor < 0;
  const cents = Math.round(Math.abs(valor) * 100);
  const inteiro = Math.floor(cents / 100);
  const centavos = cents % 100;
  const partes: string[] = [];
  if (inteiro || !centavos) {
    const extenso = inteiroPorExtenso(inteiro);
    // "dois milhões DE reais", mas "dois milhões e trezentos mil reais" — o "de" só entra
    // quando o número termina exatamente no milhão/bilhão
    const de = /(milhão|milhões|bilhão|bilhões)$/.test(extenso) ? "de " : "";
    partes.push(`${extenso} ${de}${inteiro === 1 ? "real" : "reais"}`);
  }
  if (centavos) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  return (negativo ? "menos " : "") + partes.join(" e ");
}

/** Hora por extenso: "14:30" -> "quatorze horas e trinta". */
function horaPorExtenso(h: number, m: number): string {
  const hora = `${inteiroPorExtenso(h)} ${h === 1 || h === 0 ? "hora" : "horas"}`;
  if (!m) return hora;
  if (m === 30) return `${hora} e meia`;
  return `${hora} e ${inteiroPorExtenso(m)}`;
}

/** Lê dígito a dígito, com pausa curta entre blocos. Para telefone, CEP, protocolo. */
function digitos(s: string): string {
  return s.replace(/\D/g, "").split("").map((d) => UNIDADES[Number(d)]).join(" ");
}

/**
 * Converte um texto de resposta do bot para algo que o TTS lê certo.
 * Não é SSML completo — só o que o ElevenLabs respeita bem: texto normalizado + `<break>`.
 */
export function normalizarParaVoz(texto: string): string {
  let t = texto;

  // 1. dinheiro — antes de tudo, senão o passo de números genéricos come o valor
  t = t.replace(/R\$\s*([\d.]+),(\d{2})/g, (_m, i: string, c: string) =>
    reaisPorExtenso(Number(i.replace(/\./g, "")) + Number(c) / 100));
  t = t.replace(/R\$\s*([\d.]+)\b/g, (_m, i: string) =>
    reaisPorExtenso(Number(i.replace(/\./g, ""))));

  // 2. percentual
  t = t.replace(/(\d+)(?:,(\d+))?\s*%/g, (_m, i: string, d?: string) =>
    d ? `${inteiroPorExtenso(Number(i))} vírgula ${inteiroPorExtenso(Number(d))} por cento`
      : `${inteiroPorExtenso(Number(i))} por cento`);

  // 3. data dd/mm/aaaa e dd/mm
  t = t.replace(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, (_m, d: string, mm: string, a?: string) => {
    const dia = Number(d) === 1 ? "primeiro" : inteiroPorExtenso(Number(d));
    const mes = MESES[Number(mm) - 1] ?? mm;
    if (!a) return `${dia} de ${mes}`;
    const ano = a.length === 2 ? 2000 + Number(a) : Number(a);
    return `${dia} de ${mes} de ${inteiroPorExtenso(ano)}`;
  });

  // 4. hora hh:mm e "hhh"
  t = t.replace(/\b(\d{1,2}):(\d{2})\b/g, (_m, h: string, m: string) => horaPorExtenso(Number(h), Number(m)));
  t = t.replace(/\b(\d{1,2})h(\d{2})?\b/gi, (_m, h: string, m?: string) => horaPorExtenso(Number(h), Number(m ?? 0)));

  // 5. telefone com DDD — DDD como dezena, o resto dígito a dígito
  t = t.replace(/\(?(\d{2})\)?\s*(\d{4,5})-?(\d{4})\b/g, (_m, ddd: string, a: string, b: string) =>
    `${inteiroPorExtenso(Number(ddd))}, ${digitos(a)}, ${digitos(b)}`);

  // 6. CEP
  t = t.replace(/\b(\d{5})-?(\d{3})\b/g, (_m, a: string, b: string) => `${digitos(a)} ${digitos(b)}`);

  // 7. abreviações que o TTS erra
  const abrev: Array<[RegExp, string]> = [
    [/\bAv\./gi, "Avenida"], [/\bR\.\s/gi, "Rua "], [/\bDr\./gi, "Doutor"], [/\bDra\./gi, "Doutora"],
    [/\bnº\s*/gi, "número "], [/\bn°\s*/gi, "número "], [/\bCPF\b/g, "C P F"], [/\bCNPJ\b/g, "C N P J"],
    [/\bPIX\b/gi, "Pix"], [/\bMC CRED\b/gi, "eme cê créd"],
  ];
  for (const [re, sub] of abrev) t = t.replace(re, sub);

  // 8. números soltos que sobraram (evita "1230" virar "mil duzentos e trinta" tarde demais)
  t = t.replace(/\b\d{1,6}\b/g, (m) => inteiroPorExtenso(Number(m)));

  // 9. emoji e markdown não se falam
  t = t.replace(/[*_~`#]/g, "");
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");

  // 10. vírgula em excesso deixa a leitura picotada
  t = t.replace(/,\s*,+/g, ",").replace(/\s+/g, " ").trim();

  return t;
}

/**
 * Envelopa em `<speak>` com a pausa inicial de 1s que a v3 usa — sem ela o começo da fala
 * é cortado em algumas ligações.
 */
export function envelopeSsml(texto: string): string {
  return `<speak><break time="1.0s"/>${normalizarParaVoz(texto)}</speak>`;
}

/** Barreira: nada que pareça payload Pix ou CPF completo pode virar áudio. */
export function seguroParaVoz(texto: string): { ok: true } | { ok: false; motivo: string } {
  const t = texto.trim();
  if (t.startsWith("000201") && !/\s/.test(t)) return { ok: false, motivo: "pix_copia_cola" };
  if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(t)) return { ok: false, motivo: "cpf_completo" };
  return { ok: true };
}
