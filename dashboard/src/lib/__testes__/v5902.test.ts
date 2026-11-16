// Testes das regras que vieram da V5.7.03 (atraso / prescrição) e da V5.7.16 (central de recuperação).
//   npx tsx --test src/lib/__testes__/v5902.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { anosAtras, faixaDoVencimento, limitesDaFaixa, quandoPromessa, semContatoUtil, tempoEmAtraso, triagem } from "../recuperacao";
import { enderecoAtraso, lerFiltros } from "../atraso";

// 10/11/2026, meio-dia em São Paulo
const HOJE = new Date("2026-11-10T15:00:00Z");

test("faixa de atraso: os cortes são anos de calendário, e 5 anos exatos já é 5 ou mais", () => {
  assert.equal(faixaDoVencimento("2026-11-09", HOJE), "lt1");
  assert.equal(faixaDoVencimento("2025-11-11", HOJE), "lt1");
  assert.equal(faixaDoVencimento("2025-11-10", HOJE), "1a2");
  assert.equal(faixaDoVencimento("2023-11-10", HOJE), "3a4");
  assert.equal(faixaDoVencimento("2021-11-11", HOJE), "4a5");
  assert.equal(faixaDoVencimento("2021-11-10", HOJE), "5mais");
  assert.equal(faixaDoVencimento("2008-03-01", HOJE), "5mais");
  assert.equal(faixaDoVencimento(null, HOJE), "sem");
});

test("vencimento no futuro fica em menos de 1 ano, sem dia de atraso", () => {
  assert.equal(faixaDoVencimento("2028-04-11", HOJE), "lt1");
  assert.deepEqual(tempoEmAtraso("2026-11-11", HOJE), { texto: "Vence amanhã", dias: 0 });
  assert.deepEqual(tempoEmAtraso("2026-11-10", HOJE), { texto: "Vence hoje", dias: 0 });
});

test("os limites da faixa casam com a faixa calculada linha a linha", () => {
  for (const v of ["2026-01-15", "2025-11-10", "2024-02-29", "2022-11-10", "2021-11-10", "2015-07-01"]) {
    const f = faixaDoVencimento(v, HOJE);
    const { de, ate } = limitesDaFaixa(f, HOJE);
    assert.ok((de === null || v > de) && (ate === null || v <= ate), `${v} deveria caber em ${f}`);
  }
  assert.deepEqual(limitesDaFaixa("sem", HOJE), { de: null, ate: null, semData: true });
});

test("29 de fevereiro menos um ano vira 28 de fevereiro", () => {
  assert.equal(anosAtras("2024-02-29", 1), "2023-02-28");
  assert.equal(anosAtras("2024-02-29", 4), "2020-02-29");
});

test("tempo em atraso escrito por extenso", () => {
  assert.equal(tempoEmAtraso("2026-11-09", HOJE).texto, "1 dia");
  assert.equal(tempoEmAtraso("2026-10-20", HOJE).texto, "21 dias");
  assert.equal(tempoEmAtraso("2026-03-10", HOJE).texto, "8 meses");
  assert.equal(tempoEmAtraso("2025-11-10", HOJE).texto, "1 ano");
  assert.equal(tempoEmAtraso("2020-09-01", HOJE).texto, "6 anos e 2 meses");
  assert.equal(tempoEmAtraso("2020-09-01", HOJE).dias, 2261);
  assert.equal(tempoEmAtraso(null, HOJE).texto, "Sem vencimento");
});

test("triagem nunca declara prescrição sozinha: só a data conferida pela equipe fala em prescrição", () => {
  assert.equal(triagem("5mais", null, HOJE).texto, "5 anos ou mais, prazo não conferido");
  assert.equal(triagem("5mais", null, HOJE).tom, "neutro");
  assert.equal(triagem("4a5", null, HOJE).tom, "atencao");
  assert.equal(triagem("2a3", null, HOJE).tom, "neutro");
  assert.equal(triagem("5mais", "2027-01-01", HOJE).texto, "Dentro do prazo conferido");
  assert.equal(triagem("lt1", "2026-11-10", HOJE).texto, "Prescrição conferida pela equipe");
});

test("promessa: vencida, hoje, amanhã e mais para frente pelo dia de São Paulo", () => {
  assert.equal(quandoPromessa("2026-11-09T23:30:00-03:00", HOJE), "vencida");
  assert.equal(quandoPromessa("2026-11-10T00:10:00-03:00", HOJE), "hoje");
  assert.equal(quandoPromessa("2026-11-10T23:50:00-03:00", HOJE), "hoje");
  assert.equal(quandoPromessa("2026-11-11T10:00:00-03:00", HOJE), "amanha");
  assert.equal(quandoPromessa("2026-11-20T10:00:00-03:00", HOJE), "futura");
});

test("sem contato útil soma só os motivos de higienização da fila da carteira", () => {
  assert.equal(semContatoUtil({
    "Higienizar contato: sem telefone": 154, "Higienizar contato: nenhum celular com WhatsApp": 34, "Higienizar contato: só telefone fixo": 2,
    "Acordo ativo: acompanhar as parcelas": 9, "Pediu para não ser contatado": 3,
  }), 190);
  assert.equal(semContatoUtil(null), 0);
});

test("filtros de atraso: valor inválido volta ao padrão e a busca perde os caracteres de filtro", () => {
  const f = lerFiltros({ carteira: "abc", q: "  maria, (silva)%  ", faixa: "9anos", ordem: "aleatoria" });
  assert.deepEqual(f, { carteira: null, q: "maria silva", faixa: "todas", ordem: "antigos" });
  assert.equal(enderecoAtraso(f), "/atraso?q=maria+silva");
  assert.equal(enderecoAtraso(lerFiltros({ carteira: "12", faixa: "5mais", ordem: "saldo" }), { p: "3" }), "/atraso?carteira=12&faixa=5mais&ordem=saldo&p=3");
  assert.equal(enderecoAtraso(lerFiltros({ faixa: "5mais" }), {}, "/api/atraso/exportar"), "/api/atraso/exportar?faixa=5mais");
});
