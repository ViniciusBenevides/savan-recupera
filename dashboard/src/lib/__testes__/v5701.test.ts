// Testes das regras que vieram da V5.7.01: contagem de produtividade e triagem jurídica.
//   npx tsx --test src/lib/__testes__/v5701.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularProdutividade, type Evento } from "../produtividade";
import { montarFatos, triagemDeterministica, type ContextoJuridico, type TituloJuridico, type DocumentoJuridico } from "../juridico/motor";
import { bloqueiosExclusao, type Vinculos } from "../vinculos";

const equipe = [{ id: "a", nome: "Ana", papel: "Negociador" }, { id: "b", nome: "Beto", papel: "Negociador" }];
const ev = (autor: string, devedor: number, minuto: number, tipo: Evento["tipo"], canal: Evento["canal"] = "whatsapp"): Evento => ({
  autor, devedor, carteira: 1, canal, tipo, em: new Date(Date.UTC(2026, 9, 26, 13, minuto)).toISOString(),
});

test("resultado registrado até 20 min depois da conversa não conta de novo", () => {
  const p = calcularProdutividade([ev("a", 1, 0, "mensagem"), ev("a", 1, 3, "mensagem"), ev("a", 1, 15, "ocorrencia")], equipe, new Map());
  const ana = p.pessoas.find((x) => x.pessoa.id === "a")!;
  assert.equal(ana.acionamentos, 1);
  assert.equal(ana.resultados, 1);
  assert.equal(ana.clientes, 1);
});

test("pausa maior que 20 min abre outro acionamento; canal diferente também", () => {
  const p = calcularProdutividade([ev("a", 1, 0, "mensagem"), ev("a", 1, 40, "mensagem"), ev("a", 1, 41, "ocorrencia", "ligacao")], equipe, new Map());
  const ana = p.pessoas.find((x) => x.pessoa.id === "a")!;
  assert.equal(ana.acionamentos, 3);
  assert.equal(ana.whatsapp, 2);
  assert.equal(ana.ligacoes, 1);
});

test("ranking por clientes, quem não trabalhou fica na lista e meta batida conta", () => {
  const p = calcularProdutividade([ev("b", 1, 0, "mensagem"), ev("b", 2, 1, "mensagem")], equipe, new Map([["b", { clientes: 2, acionamentos: 0 }]]));
  assert.deepEqual(p.pessoas.map((x) => [x.pessoa.id, x.posicao]), [["b", 1], ["a", 2]]);
  assert.equal(p.totais.metasBatidas, 1);
  assert.equal(p.totais.ativos, 1);
  assert.equal(p.totais.equipe, 2);
});

const contexto = (titulo: Partial<TituloJuridico>, docs: Partial<DocumentoJuridico>[] = []): ContextoJuridico => {
  const titulos: TituloJuridico[] = [{ especie: "", descricao: "", origem: "Crediário", emissao: null, vencimento: "2011-11-03", valorOriginal: 246, valorAtual: 246, prescricao: null, situacao: "Em cobrança", ...titulo }];
  const documentos: DocumentoJuridico[] = docs.map((d, i) => ({ id: i + 1, tipo: "", nome: "", observacao: "", texto: "", temArquivo: false, ...d }));
  return {
    hoje: "2026-10-26", devedor: { id: 1, nome: "Teste", documento: "", tipoPessoa: "PF", uf: "GO", cidade: null }, credor: { nome: "Credor", uf: null },
    fatos: montarFatos({ saldo: 246, titulos, documentos, hoje: "2026-10-26" }), titulos, documentos,
  };
};

test("sem prescrição conferida, a triagem não dá a prescrição como resolvida", () => {
  const t = triagemDeterministica(contexto({}));
  assert.ok(t.riscos.some((r) => r.includes("data de prescrição")));
  assert.ok(t.confianca <= 62);
});

test("nota promissória com prescrição já vencida vira monitória e a confiança cai", () => {
  const t = triagemDeterministica(contexto({ especie: "Nota promissória", prescricao: "2014-11-03" }, [{ tipo: "Nota promissória", nome: "NP 0112" }]));
  assert.equal(t.medida, "Ação monitória");
  assert.ok(t.confianca <= 40);
});

test("exclusão definitiva trava com dinheiro, acordo, Jurídico, documento ou não perturbe", () => {
  const zero: Vinculos = { telefones: 2, ocorrencias: 3, agenda: 1, conversas: 1, mensagens: 4, acordos: 0, pagamentos: 0, juridico_analises: 0, juridico_casos: 0, documentos: 0, bloqueios: 0 };
  assert.deepEqual(bloqueiosExclusao(zero), []);
  assert.deepEqual(bloqueiosExclusao({ ...zero, bloqueios: 1 }), ["1 pedido de não perturbe"]);
  assert.equal(bloqueiosExclusao({ ...zero, pagamentos: 2, acordos: 1 }).length, 2);
});
