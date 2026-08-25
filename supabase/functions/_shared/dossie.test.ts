import { assertEquals } from "jsr:@std/assert@1";
import { conversaEstavaViva, deveAnunciarTroca, montarDossie } from "./dossie.ts";

const m = (
  conversa_id: number,
  chip_id: number | null,
  direcao: "entrada" | "saida",
  conteudo: string,
  criado_em: string,
) => ({ conversa_id, chip_id, direcao, conteudo, criado_em });

Deno.test("dossie junta conversas de chips diferentes em ordem cronologica", () => {
  const d = montarDossie([
    m(2, 9, "saida", "oi de novo", "2026-08-20T10:00:00Z"),
    m(1, 4, "saida", "primeira abordagem", "2026-08-01T10:00:00Z"),
    m(1, 4, "entrada", "quem e?", "2026-08-01T10:05:00Z"),
  ]);
  assertEquals(d.map((x) => x.conteudo), ["primeira abordagem", "quem e?", "oi de novo"]);
  assertEquals(d.map((x) => x.chip_id), [4, 4, 9]);
});

Deno.test("dossie marca a fronteira em que o chip mudou", () => {
  const d = montarDossie([
    m(1, 4, "saida", "a", "2026-08-01T10:00:00Z"),
    m(1, 4, "entrada", "b", "2026-08-01T10:05:00Z"),
    m(2, 9, "saida", "c", "2026-08-20T10:00:00Z"),
  ]);
  assertEquals(d.map((x) => x.trocou_de_chip), [false, false, true]);
});

Deno.test("dossie descarta mensagem vazia: nao vira linha de historico", () => {
  const d = montarDossie([
    m(1, 4, "saida", "a", "2026-08-01T10:00:00Z"),
    m(1, 4, "entrada", "   ", "2026-08-01T10:01:00Z"),
    m(1, 4, "entrada", "", "2026-08-01T10:02:00Z"),
  ]);
  assertEquals(d.length, 1);
});

Deno.test("dossie vazio nao quebra", () => {
  assertEquals(montarDossie([]), []);
});

// ── conversaEstavaViva / deveAnunciarTroca — a decisao do Q10 ────────────────────────────

Deno.test("conversa com resposta do devedor estava viva", () => {
  assertEquals(
    conversaEstavaViva([
      m(1, 4, "saida", "abordagem", "2026-08-01T10:00:00Z"),
      m(1, 4, "entrada", "pode falar", "2026-08-01T10:05:00Z"),
    ]),
    true,
  );
});

Deno.test("so mensagem nossa nao e conversa viva: e monologo", () => {
  assertEquals(
    conversaEstavaViva([
      m(1, 4, "saida", "abordagem", "2026-08-01T10:00:00Z"),
      m(1, 4, "saida", "follow-up", "2026-08-04T10:00:00Z"),
    ]),
    false,
  );
});

Deno.test("anuncia a troca so quando a conversa estava viva E o chip mudou", () => {
  const viva = [
    m(1, 4, "saida", "abordagem", "2026-08-01T10:00:00Z"),
    m(1, 4, "entrada", "pode falar", "2026-08-01T10:05:00Z"),
  ];
  assertEquals(deveAnunciarTroca(viva, 9), true);   // chip novo, conversa viva
  assertEquals(deveAnunciarTroca(viva, 4), false);  // mesmo chip: nao ha troca a anunciar
});

Deno.test("nunca anuncia troca para quem nunca respondeu: e abordado como primeira vez", () => {
  const morta = [m(1, 4, "saida", "abordagem", "2026-08-01T10:00:00Z")];
  assertEquals(deveAnunciarTroca(morta, 9), false);
});

Deno.test("sem historico nenhum nao ha troca a anunciar", () => {
  assertEquals(deveAnunciarTroca([], 9), false);
});
