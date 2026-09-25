// Prévia das mensagens de texto pronto do fluxo (1ª mensagem, reenvio, pós-pagamento).
//
// ESPELHO do que as Edge Functions fazem ao enviar — `renderTemplate` do campanha-lote e
// `resolverOpcionais` de supabase/functions/_shared/oferta.ts. Se a prévia montar diferente do
// disparador, a tela mostra uma mensagem que ninguém recebe; mudou lá, muda aqui.

export type TipoMensagem = "disparo" | "followup" | "pos_pagamento";

export type Variavel = {
  chave: string;
  rotulo: string;
  explicacao: string;
  /** Vazia para quem não tem desconto que valha anunciar: precisa ir num trecho “só com desconto”. */
  soComDesconto?: boolean;
};

const NOME: Variavel = { chave: "nome", rotulo: "Nome completo", explicacao: "Nome completo do devedor, com as iniciais maiúsculas." };
const PRIMEIRO_NOME: Variavel = { chave: "primeiro_nome", rotulo: "Primeiro nome", explicacao: "Só o primeiro nome do devedor." };
const ATENDENTE: Variavel = { chave: "nome_bot", rotulo: "Nome da atendente", explicacao: "O nome que o robô usa para se apresentar (Ajustes → IA)." };
const CREDOR: Variavel = { chave: "credor", rotulo: "Credor", explicacao: "O credor cadastrado nesta carteira (Visão geral)." };

// O que cada envio sabe preencher. Uma variável fora desta lista sai EM BRANCO para o devedor.
export const VARIAVEIS: Record<TipoMensagem, Variavel[]> = {
  // campanha-lote → `vars`
  disparo: [
    NOME, PRIMEIRO_NOME,
    { chave: "valor", rotulo: "Valor da dívida", explicacao: "O saldo em aberto, em reais." },
    { chave: "valor_quitacao", rotulo: "Valor com desconto", explicacao: "O valor para quitar hoje, já com o desconto. É o mesmo número que o Pix vai cobrar.", soComDesconto: true },
    { chave: "desconto_pct", rotulo: "% de desconto", explicacao: "O desconto real sobre a dívida, arredondado para baixo.", soComDesconto: true },
    { chave: "vencimento", rotulo: "Vencimento", explicacao: "Data de vencimento da dívida (dd/mm/aaaa)." },
    { chave: "ano", rotulo: "Ano da dívida", explicacao: "Só o ano do vencimento." },
    ATENDENTE, CREDOR,
    { chave: "saudacao", rotulo: "Bom dia / Boa tarde", explicacao: "Muda sozinho conforme a hora do envio." },
    { chave: "cpf_final", rotulo: "Final do CPF", explicacao: "Os dois últimos dígitos do CPF — prova que temos o cadastro sem expor o documento." },
    { chave: "processo", rotulo: "Protocolo", explicacao: "O número de referência da dívida na planilha importada." },
  ],
  // campanha-followup → montarTemplate
  followup: [NOME, ATENDENTE, CREDOR],
  // webhook-asaas → `vars`
  pos_pagamento: [
    PRIMEIRO_NOME,
    { chave: "valor_pago", rotulo: "Valor pago", explicacao: "Quanto a pessoa pagou." },
    { chave: "data_pagamento", rotulo: "Data do pagamento", explicacao: "Dia em que o pagamento foi confirmado." },
    { chave: "nome", rotulo: "Nome completo", explicacao: "Nome como está na planilha (pode vir em maiúsculas)." },
    { chave: "processo", rotulo: "Protocolo", explicacao: "O número de referência da dívida." },
  ],
};

/** Onde cada tipo permite a frase “só com desconto”. Só a 1ª mensagem calcula a oferta. */
export const ACEITA_OPCIONAL: Record<TipoMensagem, boolean> = { disparo: true, followup: false, pos_pagamento: false };

export type ValoresPrevia = Record<string, string>;

/** Exemplo fictício, usado enquanto os dados reais da carteira não chegam (ou se ela está vazia). */
export function exemploFicticio(comDesconto: boolean, nomeBot: string, credor: string): ValoresPrevia {
  return {
    nome: "Maria Aparecida Souza", primeiro_nome: "Maria", nome_bot: nomeBot, credor,
    valor: "R$ 165,00", vencimento: "12/03/2014", ano: "2014", cpf_final: "45", processo: "0012345",
    valor_quitacao: comDesconto ? "R$ 77,00" : "", desconto_pct: comDesconto ? "53%" : "",
    valor_pago: comDesconto ? "R$ 77,00" : "R$ 165,00", data_pagamento: new Date().toLocaleDateString("pt-BR"),
  };
}

export function saudacaoAgora(data = new Date()): string {
  const hora = data.getHours();
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

/**
 * Monta a mensagem como o devedor recebe. `semente` escolhe as palavras sorteadas de forma
 * previsível, para a prévia não piscar a cada tecla — mudar a semente é o “sortear de novo”.
 */
export function montarMensagem(texto: string, valores: ValoresPrevia, semente = 0): string {
  let contador = 0;
  let anterior = "";
  let atual = texto;
  while (atual !== anterior) {
    anterior = atual;
    atual = atual.replace(/\{([^{}]*\|[^{}]*)\}/g, (_m, grupo: string) => {
      const opcoes = grupo.split("|");
      return opcoes[Math.abs(semente + contador++ * 7) % opcoes.length];
    });
  }
  atual = atual.replace(/(\n*)\[\[([\s\S]*?)\]\](\n*)/g, (_c, antes: string, dentro: string, depois: string) => {
    const nomes = [...dentro.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase());
    const completo = nomes.length > 0 && nomes.every((n) => String(valores[n] ?? "").trim() !== "");
    if (completo) return antes + dentro + depois;
    return antes && depois ? "\n\n" : "";
  });
  return atual.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, chave: string) => valores[chave] ?? "");
}

export type Revisao = { nivel: "erro" | "aviso" | "dica"; mensagem: string };

// Prazo e urgência na abertura são o padrão que o WhatsApp lê como golpe (skill fluxo-do-robo).
const ESCASSEZ = ["última chance", "ultima chance", "prazo", "expira", "válido até", "valido ate", "só hoje", "so hoje", "urgente"];

/** O que a pessoa precisa saber sobre o texto enquanto escreve, em linguagem de quem não programa. */
export function revisarTexto(texto: string, tipo: TipoMensagem): Revisao[] {
  const lista: Revisao[] = [];
  if (!texto.trim()) return [{ nivel: "erro", mensagem: "Esta versão está vazia e não será enviada." }];

  const conhecidas = new Map(VARIAVEIS[tipo].map((v) => [v.chave, v]));
  const usadas = [...texto.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase());
  for (const chave of new Set(usadas)) {
    if (!conhecidas.has(chave)) {
      lista.push({ nivel: "erro", mensagem: `“{{${chave}}}” não existe nesta mensagem e sairia em branco. Use os botões de “Inserir” acima.` });
    }
  }

  const abre = (texto.match(/\[\[/g) ?? []).length;
  const fecha = (texto.match(/\]\]/g) ?? []).length;
  if (abre !== fecha) lista.push({ nivel: "erro", mensagem: "Um trecho “só com desconto” foi aberto com [[ e não foi fechado com ]]." });
  if (abre > 0 && !ACEITA_OPCIONAL[tipo]) lista.push({ nivel: "erro", mensagem: "Trecho “só com desconto” só funciona na primeira mensagem." });

  const semOpcional = texto.replace(/\[\[[\s\S]*?\]\]/g, "");
  for (const chave of new Set([...semOpcional.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase()))) {
    const variavel = conhecidas.get(chave);
    if (variavel?.soComDesconto) {
      lista.push({
        nivel: "erro",
        mensagem: `“${variavel.rotulo}” fica vazio para quem não tem desconto, e a frase sairia pela metade. Selecione a frase e clique em “Só com desconto”.`,
      });
    }
  }

  const chavesAbertas = (texto.replace(/\{\{|\}\}/g, "").match(/\{/g) ?? []).length;
  const chavesFechadas = (texto.replace(/\{\{|\}\}/g, "").match(/\}/g) ?? []).length;
  if (chavesAbertas !== chavesFechadas) lista.push({ nivel: "erro", mensagem: "Um sorteio de palavras {Oi|Olá} está sem a chave de abrir ou de fechar." });
  if (/\{[^{}]*\|\s*\}|\{\s*\|[^{}]*\}|\|\s*\|/.test(texto.replace(/\{\{|\}\}/g, ""))) {
    lista.push({ nivel: "aviso", mensagem: "Um sorteio tem uma opção vazia: às vezes a palavra vai sumir da mensagem." });
  }

  if (tipo !== "pos_pagamento") {
    const minusculo = texto.toLocaleLowerCase("pt-BR");
    const achado = ESCASSEZ.find((termo) => minusculo.includes(termo));
    if (achado) lista.push({ nivel: "aviso", mensagem: `Evite “${achado}”: prazo e urgência logo no começo é o que o WhatsApp e as pessoas leem como golpe.` });
  }
  if (tipo === "disparo" && !/\bn[aã]o\b[^.?!\n]*(receber|contat|mensag|parar|incomod)|(parar|n[aã]o receber)[^.?!\n]*\bn[aã]o\b/i.test(texto)) {
    lista.push({ nivel: "dica", mensagem: "Dizer como parar (ex.: “se não quiser receber mais mensagens, responda não”) reduz denúncias, que são o que derruba o número." });
  }
  return lista;
}

export type Trecho = { tipo: "texto" | "variavel" | "sorteio" | "opcional"; valor: string };

/** Quebra o texto em trechos para o editor pintar variáveis, sorteios e trechos opcionais. */
export function trechosParaDestaque(texto: string): Trecho[] {
  const trechos: Trecho[] = [];
  const padrao = /(\{\{\s*[a-z_]+\s*\}\})|(\[\[|\]\])|(\{[^{}]*\|[^{}]*\})/gi;
  let ultimo = 0;
  for (const m of texto.matchAll(padrao)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) trechos.push({ tipo: "texto", valor: texto.slice(ultimo, inicio) });
    trechos.push({ tipo: m[1] ? "variavel" : m[2] ? "opcional" : "sorteio", valor: m[0] });
    ultimo = inicio + m[0].length;
  }
  if (ultimo < texto.length) trechos.push({ tipo: "texto", valor: texto.slice(ultimo) });
  return trechos;
}

/* -------- formatação: a mesma do campanha-lote, para a prévia com devedor real -------- */

// supabase/functions/_shared/oferta.ts → DESCONTO_MINIMO_ANUNCIAVEL_PP e descontoEfetivoPP
const DESCONTO_MINIMO_ANUNCIAVEL_PP = 10;
export function descontoEfetivoPP(valorOriginal: unknown, valorFinal: unknown): number | null {
  const bruto = Number(valorOriginal);
  const final = Number(valorFinal);
  if (!Number.isFinite(bruto) || !Number.isFinite(final)) return null;
  if (bruto <= 0 || final < 0 || final >= bruto) return null;
  const pp = Math.floor((1 - final / bruto) * 100 + 1e-9);
  return pp >= DESCONTO_MINIMO_ANUNCIAVEL_PP ? pp : null;
}

export function formatarBRL(valor: unknown): string {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarDataBR(data: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data ?? "").slice(0, 10));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function formatarNomeCompleto(nome: unknown): string {
  const conectores = new Set(["da", "das", "de", "do", "dos", "e"]);
  return String(nome ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((parte, indice) => indice > 0 && conectores.has(parte)
      ? parte
      : parte.charAt(0).toLocaleUpperCase("pt-BR") + parte.slice(1))
    .join(" ");
}

export function finalDoCpf(documento: unknown): string {
  const digitos = String(documento ?? "").replace(/\D/g, "");
  return digitos.length === 11 ? digitos.slice(-2) : "";
}
