// SAVAN Recupera — guardrail de SAÍDA
//
// O `bot_guardrails` do banco é guardrail de ENTRADA: instrução no system prompt, que o modelo
// obedece na maior parte das vezes. Isto aqui é a outra metade — a checagem determinística da
// resposta **depois** que o modelo escreveu e **antes** de a pessoa ler.
//
// A justificativa é a mesma que a fazer.ai dá na v3, e vale ainda mais aqui: "a LLM é
// estatística, não determinística — num espaço amostral grande ela vai errar". A diferença é o
// preço do erro. Lá, um agendamento errado. Aqui, um valor de dívida errado, um CPF exposto a
// quem não confirmou identidade, ou uma frase que configura constrangimento na cobrança
// (CDC art. 42 e 42-A, Lei 14.181/2021) — e foi esse tipo de sinal que custou a WABA (§38).
//
// Filosofia: **bloquear é melhor que corrigir, e escalar é melhor que bloquear em silêncio.**
// Nada aqui reescreve conteúdo — só aprova, sanitiza o que é seguro sanitizar, ou barra.

export type Veredito =
  | { ok: true; respostas: string[] }
  | { ok: false; motivo: string; detalhe: string; escalar: boolean };

export interface ContextoGuardrail {
  /** Proposta server-side vigente. Nenhum valor fora dela pode ser dito. */
  proposta?: { valor_final?: number | string; desconto_pct?: number | string } | null;
  /** Saldo original da dívida — pode ser citado. */
  saldoOriginal?: number | string | null;
  /** A identidade da pessoa já foi confirmada nesta conversa? */
  identidadeConfirmada: boolean;
  /** CPF do devedor, para detectar exposição indevida. Nunca é logado. */
  cpfDevedor?: string | null;
}

/** Saídas de framework que nunca podem chegar a uma pessoa. Vem do "Output válido?" da v3. */
const LIXO_DE_FRAMEWORK = [
  "agent stopped due to max iterations",
  "i'm sorry, i cannot",
  "as an ai language model",
  "não consigo ajudar com isso",
  "[object object]",
  "undefined",
  "null",
];

/**
 * Linguagem de cobrança que expõe a operação. Não é moralismo: cada item aqui é vizinho de
 * um artigo do CDC ou de um padrão que motiva denúncia — que é o que derruba número.
 */
const LINGUAGEM_PROIBIDA: Array<{ re: RegExp; motivo: string }> = [
  { re: /\b(neg[ai]tiva(r|ção|do|remos)?|serasa|spc|scpc)\b/i, motivo: "ameaca_negativacao" },
  { re: /\b(protesto|protestar|cart[óo]rio)\b/i, motivo: "ameaca_protesto" },
  { re: /\b(processo|processar|a[çc][ãa]o judicial|advogad[oa] (vai|ir[áa]))\b/i, motivo: "ameaca_judicial" },
  { re: /\b(penhora|bloqueio de conta|busca e apreens[ãa]o|oficial de justi[çc]a)\b/i, motivo: "ameaca_constricao" },
  { re: /\b(vergonha|vexame|caloteir[oa]|devedor contumaz|mal pagador)\b/i, motivo: "constrangimento" },
  { re: /\b([úu]ltim[ao] (chance|aviso|oportunidade)|agora ou nunca|s[óo] hoje|expira em minutos)\b/i, motivo: "pressao_indevida" },
  { re: /\b(vamos (te )?(cobrar|acionar)|voc[êe] (vai|ir[áa]) se arrepender)\b/i, motivo: "coercao" },
  { re: /\b(informe (seu|sua) (senha|c[óo]digo|token)|c[óo]digo de (verifica[çc][ãa]o|seguran[çc]a))\b/i, motivo: "pedido_credencial" },
];

/** Normaliza "1.234,56" / "1234.56" / 1234.56 para número. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Todos os valores em reais citados no texto. */
function valoresCitados(texto: string): number[] {
  const out: number[] = [];
  for (const m of texto.matchAll(/R\$\s*([\d.]+(?:,\d{2})?)/g)) {
    const n = num(m[1]);
    if (n !== null) out.push(n);
  }
  return out;
}

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Valida a resposta do bot antes do envio.
 *
 * `escalar: true` no veredito negativo significa: não tente de novo, passe para humano. É o
 * caminho para tudo que envolve dinheiro errado ou dado pessoal — repetir a chamada do modelo
 * só sorteia de novo.
 */
export function validarSaida(respostas: string[], ctx: ContextoGuardrail): Veredito {
  const limpas = respostas.map((r) => (r ?? "").trim()).filter(Boolean);

  // 1. resposta vazia ou lixo de framework
  if (!limpas.length) {
    return { ok: false, motivo: "resposta_vazia", detalhe: "o modelo não produziu texto", escalar: false };
  }
  for (const r of limpas) {
    const baixo = r.toLowerCase();
    for (const lixo of LIXO_DE_FRAMEWORK) {
      if (baixo === lixo || baixo.includes(lixo)) {
        return { ok: false, motivo: "output_invalido", detalhe: lixo, escalar: false };
      }
    }
  }

  const inteiro = limpas.join("\n");

  // 2. linguagem que expõe a operação — barra e escala, nunca reescreve
  for (const { re, motivo } of LINGUAGEM_PROIBIDA) {
    const achado = inteiro.match(re);
    if (achado) {
      return { ok: false, motivo, detalhe: achado[0], escalar: true };
    }
  }

  // 3. CPF completo antes da identidade confirmada — é exatamente o vazamento que a regra de
  //    confirmação de identidade existe para impedir
  if (!ctx.identidadeConfirmada && /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(inteiro)) {
    return {
      ok: false,
      motivo: "cpf_sem_identidade",
      detalhe: "CPF completo citado antes da confirmação de identidade",
      escalar: true,
    };
  }

  // 4. CPF de OUTRA pessoa — sempre grave, mesmo com identidade confirmada
  if (ctx.cpfDevedor) {
    const esperado = soDigitos(ctx.cpfDevedor);
    for (const m of inteiro.matchAll(/\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/g)) {
      if (soDigitos(m[1]) !== esperado) {
        return { ok: false, motivo: "cpf_de_terceiro", detalhe: "CPF citado não é o do devedor", escalar: true };
      }
    }
  }

  // 5. valor inventado — o coração do guardrail. Só podem aparecer: o valor da proposta
  //    vigente, o saldo original, e valores pequenos que são claramente contagem (parcelas etc.)
  const permitidos = new Set<number>();
  const vf = num(ctx.proposta?.valor_final);
  const so = num(ctx.saldoOriginal);
  if (vf !== null) permitidos.add(Math.round(vf * 100) / 100);
  if (so !== null) permitidos.add(Math.round(so * 100) / 100);
  for (const v of valoresCitados(inteiro)) {
    const arred = Math.round(v * 100) / 100;
    if (permitidos.has(arred)) continue;
    // tolerância de 1 centavo para arredondamento do modelo
    let perto = false;
    for (const p of permitidos) if (Math.abs(p - arred) <= 0.01) perto = true;
    if (perto) continue;
    return {
      ok: false,
      motivo: "valor_nao_autorizado",
      detalhe: `R$ ${arred.toFixed(2)} não corresponde à proposta nem ao saldo`,
      escalar: true,
    };
  }

  // 6. percentual de desconto diferente do vigente
  const pct = num(ctx.proposta?.desconto_pct);
  if (pct !== null) {
    for (const m of inteiro.matchAll(/(\d{1,3})\s*%/g)) {
      const citado = Number(m[1]);
      if (Math.abs(citado - pct) > 0.5) {
        return {
          ok: false,
          motivo: "desconto_nao_autorizado",
          detalhe: `${citado}% não corresponde aos ${pct}% da proposta`,
          escalar: true,
        };
      }
    }
  }

  return { ok: true, respostas: limpas };
}
