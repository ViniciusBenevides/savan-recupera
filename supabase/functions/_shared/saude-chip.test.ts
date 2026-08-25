import { assertEquals } from "jsr:@std/assert@1";
import { acaoParaVeredicto, avaliarEntrega, taxaEntrega } from "./saude-chip.ts";

Deno.test("taxa de entrega e nula sem envio nenhum: dividir por zero nao e zero por cento", () => {
  assertEquals(taxaEntrega(0, 0), null);
});

Deno.test("taxa de entrega e a proporcao simples", () => {
  assertEquals(taxaEntrega(10, 10), 1);
  assertEquals(taxaEntrega(10, 5), 0.5);
  assertEquals(taxaEntrega(4, 1), 0.25);
});

Deno.test("amostra pequena nunca condena um chip", () => {
  // O erro simetrico ao do §36: travar um chip saudavel por causa de 2 envios azarados.
  const r = avaliarEntrega({ enviadas: 3, entregues: 0 });
  assertEquals(r.veredicto, "sem_dados");
  assertEquals(r.taxa, 0);
});

Deno.test("amostra suficiente e entrega alta e chip saudavel", () => {
  assertEquals(avaliarEntrega({ enviadas: 20, entregues: 19 }).veredicto, "saudavel");
  assertEquals(avaliarEntrega({ enviadas: 10, entregues: 9 }).veredicto, "saudavel");
});

Deno.test("entrega caindo e degradado, nao critico", () => {
  assertEquals(avaliarEntrega({ enviadas: 20, entregues: 14 }).veredicto, "degradado");
});

Deno.test("entrega despencando e critico: e a assinatura do bloqueio silencioso do §31", () => {
  assertEquals(avaliarEntrega({ enviadas: 20, entregues: 4 }).veredicto, "critico");
  assertEquals(avaliarEntrega({ enviadas: 30, entregues: 0 }).veredicto, "critico");
});

Deno.test("o limite da amostra minima e inclusivo", () => {
  assertEquals(avaliarEntrega({ enviadas: 9, entregues: 0 }).veredicto, "sem_dados");
  assertEquals(avaliarEntrega({ enviadas: 10, entregues: 0 }).veredicto, "critico");
});

Deno.test("cada veredicto tem uma acao, e sem_dados nunca age", () => {
  assertEquals(acaoParaVeredicto("sem_dados"), "seguir");
  assertEquals(acaoParaVeredicto("saudavel"), "seguir");
  assertEquals(acaoParaVeredicto("degradado"), "travar_abordagem");
  assertEquals(acaoParaVeredicto("critico"), "propor_failover");
});
