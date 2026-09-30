/**
 * A oferta de quitação dentro do texto de abordagem.
 *
 * A 1ª mensagem passou a anunciar o desconto (decisão do dono, 03/09/2026), e isso tem uma
 * armadilha que não é óbvia: a `fn_proposta` aplica o piso `valor_minimo_pix` DEPOIS do
 * percentual da faixa. Uma dívida de R$ 45 com faixa de 60% daria R$ 18, mas o piso sobe para
 * R$ 30 — desconto real de 33%, não 60%. Anunciar o percentual da faixa seria prometer o que o
 * Pix não cobra, e é o tipo de coisa que vira Procon.
 *
 * Daí as duas peças aqui: o desconto EFETIVO (calculado do valor final, não da faixa) e um jeito
 * de a linha inteira da oferta sumir quando não há desconto que valha anunciar.
 */

/**
 * Abaixo disto o desconto não vai na abordagem: o trecho `[[...]]` some e a pessoa recebe só a
 * identificação. A proposta real continua sendo oferecida na conversa, pela ferramenta, com o
 * número certo — o que se perde é só o anúncio antecipado.
 */
export const DESCONTO_MINIMO_ANUNCIAVEL_PP = 10;

/**
 * Desconto efetivo da proposta, em pontos percentuais inteiros, arredondado PARA BAIXO.
 *
 * Para baixo porque anunciar 59% e entregar 60% é seguro; o contrário não é. Devolve `null`
 * quando não há proposta utilizável ou quando o desconto não chega ao mínimo — e aí quem chama
 * deixa as variáveis vazias, o que faz o trecho opcional desaparecer.
 *
 * `pctDaProposta` é o `desconto_pct` da `fn_proposta`. Quando o valor final é exatamente esse
 * percentual aplicado e arredondado no centavo, o percentual anunciado é ELE — e não o efetivo
 * recalculado. Em 29/09/2026 a abertura disse "39%" e o robô, dois turnos depois, "40%", para a
 * mesma proposta: R$ 68,18 com 40% dá R$ 40,908 → R$ 40,91, e a conta de volta dá 39,997%. Os dois
 * números descreviam o mesmo Pix, e a pessoa via uma contradição. Com o piso do Pix no meio, o
 * valor final deixa de ser o percentual aplicado e vale o efetivo arredondado para baixo, como antes.
 *
 * A comparação é com o valor EXATO, sem arredondar aqui: a `fn_proposta` arredonda em `numeric`
 * (meio centavo sobe), e `Math.round` sobre ponto flutuante às vezes desce — R$ 64,07 a 50% dá
 * 32,034999… em JS e R$ 32,04 no banco. Arredondar dos dois lados fazia a regra falhar em ~3% das
 * dívidas e a contradição voltar. Aceito conscientemente: quando o centavo sobe, o Pix fica menos de
 * meio centavo acima do percentual exato, e o anunciado é o percentual da faixa que gerou o preço —
 * o mesmo número que o robô dirá na conversa.
 */
export function descontoEfetivoPP(valorOriginal: unknown, valorFinal: unknown, pctDaProposta?: unknown): number | null {
  const bruto = Number(valorOriginal);
  const final = Number(valorFinal);
  if (!Number.isFinite(bruto) || !Number.isFinite(final)) return null;
  if (bruto <= 0 || final < 0 || final >= bruto) return null;

  const pct = Number(pctDaProposta);
  if (pctDaProposta != null && Number.isFinite(pct) && pct > 0 && pct < 100) {
    const exato = bruto * (1 - pct / 100);
    if (Math.abs(exato - final) <= 0.005 + 1e-9) {
      const anunciado = Math.floor(pct + 1e-9);
      return anunciado >= DESCONTO_MINIMO_ANUNCIAVEL_PP ? anunciado : null;
    }
  }

  // O epsilon não é preciosismo: `1 - 90/100` dá 0,09999999999999998 em ponto flutuante, e sem ele
  // um desconto de exatos 10% virava 9 e caía fora do mínimo. Pequeno o bastante para não
  // transformar 66,7% em 67.
  const pp = Math.floor((1 - final / bruto) * 100 + 1e-9);
  return pp >= DESCONTO_MINIMO_ANUNCIAVEL_PP ? pp : null;
}

/**
 * Trecho opcional: `[[ ... ]]` some INTEIRO se qualquer `{{var}}` dentro dele estiver vazia.
 *
 * Sem isto, quem cai no piso receberia uma frase quebrada — "de R$ 45,00 por  —  de desconto" —,
 * que é a assinatura de template mal preenchido que a abordagem não pode ter. As quebras de linha
 * em volta vão junto, para não sobrar parágrafo em branco no meio da mensagem.
 *
 * A frase fica no roteiro, e não montada em código, de propósito: o texto da oferta é conteúdo do
 * dono da operação, editável no painel como todo o resto do disparo.
 */
export function resolverOpcionais(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/(\n*)\[\[([\s\S]*?)\]\](\n*)/g, (_casado, antes: string, dentro: string, depois: string) => {
    const nomes = [...dentro.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase());
    const completo = nomes.length > 0 && nomes.every((n) => String(vars[n] ?? "").trim() !== "");
    if (completo) return antes + dentro + depois;
    // O trecho caiu. Se ele separava dois parágrafos, sobra a separação — não a soma das duas.
    return antes && depois ? "\n\n" : "";
  });
}
