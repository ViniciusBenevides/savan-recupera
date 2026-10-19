// Testes da lógica pura (datas, leitura de mensagem, conta do acordo).
//   npx tsx --test src/lib/__testes__/logica.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerData, lerMensagem } from "../ia/ler-mensagem";
import { sugerirResposta } from "../ia/sugerir-resposta";
import { simularAcordo, descontoReal } from "../acordo";
import { instanteSP, diaISO, porExtenso, proximoDiaUtil, margem } from "../datas";

// sexta-feira, 16/10/2026, 10:04 em São Paulo
const AGORA = instanteSP(2026, 10, 16, 10, 4);

test("'dia 10' num dia 16 vira 10 do mês que vem", () => {
  const r = lerData("consigo pagar dia 10, pode ser?", AGORA);
  assert.equal(diaISO(r!.data), "2026-11-10");
  assert.match(r!.obs, /já passou/);
});
test("'dia 20' num dia 16 fica neste mês", () => {
  assert.equal(diaISO(lerData("pago dia 20", AGORA)!.data), "2026-10-20");
});
test("amanhã, sexta, dd/mm e semana que vem", () => {
  assert.equal(diaISO(lerData("pago amanhã", AGORA)!.data), "2026-10-17");
  assert.equal(diaISO(lerData("me chama sexta", AGORA)!.data), "2026-10-23");
  assert.equal(diaISO(lerData("dia 05/11 eu pago", AGORA)!.data), "2026-11-05");
  assert.equal(diaISO(lerData("semana que vem", AGORA)!.data), "2026-10-19");
  assert.equal(diaISO(lerData("02/01", AGORA)!.data), "2027-01-02");
});
test("sem data não inventa data", () => {
  assert.equal(lerData("vou ver com meu marido", AGORA), null);
});
test("intenções principais", () => {
  assert.equal(lerMensagem("Moço, consigo pagar dia 10, pode ser?", AGORA).intencao, "promessa");
  assert.equal(lerMensagem("Quero pagar. Me manda o pix", AGORA).intencao, "quer_pagar");
  assert.equal(lerMensagem("Isso é golpe? Nunca comprei nessa loja", AGORA).intencao, "desconfiado");
  assert.equal(lerMensagem("Tô desempregado agora, mas queria resolver. Dá pra parcelar?", AGORA).intencao, "pediu_parcelar");
  assert.equal(lerMensagem("Não. Não me mande mais mensagem", AGORA).bloquear, true);
  assert.equal(lerMensagem("já paguei isso faz tempo", AGORA).intencao, "ja_pagou");
  assert.equal(lerMensagem("não", AGORA).intencao, "nao_perturbe");
});
test("datas por extenso e margem da caderneta", () => {
  assert.equal(porExtenso(AGORA), "Sexta-feira, 16 de outubro");
  assert.equal(margem(instanteSP(2026, 10, 16, 9, 42), AGORA), "09:42");
  assert.equal(margem(instanteSP(2026, 10, 15, 16, 20), AGORA), "ontem");
  // próximo dia útil a partir de sexta = segunda
  assert.equal(diaISO(proximoDiaUtil(AGORA, 10)), "2026-10-19");
});
test("acordo: à vista com desconto", () => {
  const s = simularAcordo({ valor_divida: 412.8, desconto_pct: 60, parcelas: 1, entrada: 0, primeiro_vencimento: "2026-11-10" },
    { desconto_max_pct: 60, parcelas_max: 6, entrada_min_pct: 0, parcela_min_valor: 30 });
  assert.equal(s.valor_total, 165.12);
  assert.deepEqual(s.parcelas, [{ numero: 1, vencimento: "2026-11-10", valor: 165.12 }]);
  assert.equal(s.problemas.length, 0);
  assert.equal(s.precisa_liberacao, false);
});
test("acordo: entrada + 3 parcelas fecha no centavo", () => {
  const s = simularAcordo({ valor_divida: 500, desconto_pct: 33.33, parcelas: 3, entrada: 50, primeiro_vencimento: "2026-10-31" },
    { desconto_max_pct: 60, parcelas_max: 6, entrada_min_pct: 10, parcela_min_valor: 30 });
  const soma = s.parcelas.reduce((a, p) => a + Math.round(p.valor * 100), 0) / 100;
  assert.equal(soma, s.valor_total);
  assert.equal(s.parcelas.length, 4);
  assert.equal(s.parcelas[0].numero, 0);
  // 31/10 + 1 mês = 30/11 (último dia do mês)
  assert.equal(s.parcelas[1].vencimento, "2026-11-30");
});
test("acordo: fora do limite pede liberação e bloqueia parcela pequena", () => {
  const s = simularAcordo({ valor_divida: 100, desconto_pct: 70, parcelas: 6, entrada: 0, primeiro_vencimento: "2026-10-20" },
    { desconto_max_pct: 60, parcelas_max: 6, entrada_min_pct: 0, parcela_min_valor: 30 });
  assert.equal(s.precisa_liberacao, true);
  assert.ok(s.problemas.some((p) => p.includes("parcela mínima")));
});
test("desconto real: piso do Pix e dívida pequena", () => {
  assert.equal(descontoReal(412.8, 165.12), 60);   // faixa aplicada inteira
  assert.equal(descontoReal(50, 30), 40);          // 60% daria R$ 20, o mínimo de R$ 30 segura
  assert.equal(descontoReal(9.9, 9.9), 0);         // abaixo do mínimo: sem desconto
  assert.equal(descontoReal(0, 0), 0);
});
test("sugestão de parcelamento promete o mesmo que o acordo cobra", () => {
  const ctx = { nome: "RAIMUNDO NONATO", credor: "SAVAN Calçados", ano: 2008, divida: 690.5, proposta: 276.2, parcelasMax: 6, parcelaMin: 30 };
  const leitura = { intencao: "pediu_parcelar" as const, rotulo: "", data: null, dataTexto: null, sensivel: false, bloquear: false };
  const txt = sugerirResposta(leitura, ctx)!.split(String.fromCharCode(160)).join(" "); // o brl() usa espaço fixo
  assert.match(txt, /6x de R\$ 46,03 \(a última de R\$ 46,05\)/);
  const sim = simularAcordo({ valor_divida: 690.5, desconto_pct: 60, parcelas: 6, entrada: 0, primeiro_vencimento: "2026-11-10" },
    { desconto_max_pct: 60, parcelas_max: 6, entrada_min_pct: 0, parcela_min_valor: 30 });
  assert.deepEqual(sim.parcelas.map((p) => p.valor), [46.03, 46.03, 46.03, 46.03, 46.03, 46.05]);
});
