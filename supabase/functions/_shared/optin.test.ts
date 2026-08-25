import { assertEquals } from "jsr:@std/assert@1";
import {
  classificarRespostaOptIn,
  mensagemOptIn,
  podeRevelarDados,
  proximoEstadoOptIn,
} from "./optin.ts";

// ── as duas portas do Q12 ────────────────────────────────────────────────────────────────

Deno.test("sim explicito concede", () => {
  for (const t of ["sim", "Sim", "pode falar", "pode sim", "claro", "manda", "pode mandar", "ok"]) {
    assertEquals(classificarRespostaOptIn(t), "concede", `falhou em: ${t}`);
  }
});

Deno.test("pergunta sobre o ASSUNTO destrava: e interesse", () => {
  for (
    const t of [
      "do que se trata?",
      "que atendimento e esse",
      "qual o assunto",
      "e sobre o que",
      "que conta antiga?",
    ]
  ) {
    assertEquals(classificarRespostaOptIn(t), "pergunta_assunto", `falhou em: ${t}`);
  }
});

Deno.test("pergunta sobre QUEM FALA nao destrava: e desconfianca", () => {
  // A distincao que o §38 ensinou: tratar desconfianca como consentimento gerou acusacao de golpe.
  for (const t of ["quem e voce?", "quem fala", "isso e golpe?", "que empresa e essa", "e golpe ne"]) {
    assertEquals(classificarRespostaOptIn(t), "pergunta_quem_fala", `falhou em: ${t}`);
  }
});

Deno.test("recusa e recusa, em qualquer forma", () => {
  for (const t of ["nao", "não quero", "nao tenho interesse", "para de mandar", "me tira dessa lista"]) {
    assertEquals(classificarRespostaOptIn(t), "recusa", `falhou em: ${t}`);
  }
});

Deno.test("mensagem sem conteudo util e ambigua, nao consentimento", () => {
  for (const t of ["", "   ", "👍", "?", "kkk"]) {
    assertEquals(classificarRespostaOptIn(t), "ambiguo", `falhou em: ${t}`);
  }
});

// ── o gate do §1 ─────────────────────────────────────────────────────────────────────────

Deno.test("so opt-in concedido libera dado da conta", () => {
  assertEquals(podeRevelarDados("concedido"), true);
  assertEquals(podeRevelarDados("nao_perguntado"), false);
  assertEquals(podeRevelarDados("aguardando"), false);
  assertEquals(podeRevelarDados("recusado"), false);
});

// ── transicao de estado ──────────────────────────────────────────────────────────────────

Deno.test("concede leva a concedido; recusa leva a recusado", () => {
  assertEquals(proximoEstadoOptIn("aguardando", "concede"), "concedido");
  assertEquals(proximoEstadoOptIn("aguardando", "recusa"), "recusado");
});

Deno.test("pergunta sobre o assunto concede: quem pergunta o que e quer saber", () => {
  assertEquals(proximoEstadoOptIn("aguardando", "pergunta_assunto"), "concedido");
});

Deno.test("desconfianca e ambiguidade mantem aguardando", () => {
  assertEquals(proximoEstadoOptIn("aguardando", "pergunta_quem_fala"), "aguardando");
  assertEquals(proximoEstadoOptIn("aguardando", "ambiguo"), "aguardando");
});

Deno.test("recusado e terminal: nada reabre, nem um sim depois", () => {
  assertEquals(proximoEstadoOptIn("recusado", "concede"), "recusado");
  assertEquals(proximoEstadoOptIn("recusado", "pergunta_assunto"), "recusado");
});

Deno.test("concedido nao regride por uma mensagem ambigua", () => {
  assertEquals(proximoEstadoOptIn("concedido", "ambiguo"), "concedido");
  assertEquals(proximoEstadoOptIn("concedido", "pergunta_quem_fala"), "concedido");
});

Deno.test("concedido ainda aceita uma recusa posterior", () => {
  assertEquals(proximoEstadoOptIn("concedido", "recusa"), "recusado");
});

// ── a mensagem de abertura (Q13) ─────────────────────────────────────────────────────────

Deno.test("a abertura usa o primeiro nome e nao pergunta identidade", () => {
  const m = mensagemOptIn("MARIA APARECIDA DA SILVA", "MC Cred");
  assertEquals(m.includes("Maria"), true);
  assertEquals(m.includes("MC Cred"), true);
  // nunca o nome completo, nunca caixa alta, nunca pergunta de identidade
  assertEquals(m.includes("Aparecida"), false);
  assertEquals(m.includes("MARIA"), false);
  assertEquals(/falo com|voc[eê] [eé] a|confirma/i.test(m), false);
});

Deno.test("a abertura declara a saida facil: e o que converte golpe em silencio educado", () => {
  const m = mensagemOptIn("Maria", "MC Cred");
  assertEquals(/ignorar|n[aã]o escrevo|sem problema/i.test(m), true);
});

Deno.test("a abertura nao revela nada da conta", () => {
  const m = mensagemOptIn("Maria", "MC Cred").toLowerCase();
  for (const proibido of ["cpf", "d[ií]vida", "valor", "r$", "processo", "desconto", "pagamento"]) {
    assertEquals(new RegExp(proibido).test(m), false, `vazou: ${proibido}`);
  }
});
