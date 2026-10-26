// Triagem jurídica determinística e minuta-padrão (porte do legal_engine.py do MC COB V5.7.01).
// A triagem é conservadora: recomenda a medida, nunca autoriza protocolo. Requisito que não está
// comprovado nos títulos e documentos baixa a confiança e vira pendência escrita.
import { brl } from "@/lib/utils";

export type TituloJuridico = {
  especie: string; descricao: string; origem: string; emissao: string | null; vencimento: string | null;
  valorOriginal: number; valorAtual: number; prescricao: string | null; situacao: string;
};
export type DocumentoJuridico = { id: number; tipo: string; nome: string; observacao: string; texto: string; temArquivo: boolean };
export type Fatos = {
  saldo: number; saldoTexto: string; titulos: number; primeiroVenc: string | null; ultimoVenc: string | null; anos: number[];
  diasAtraso: number; valoresDocumentos: number[]; datasDocumentos: string[]; anosDocumentos: number[];
};
export type ContextoJuridico = {
  hoje: string;
  devedor: { id: number; nome: string; documento: string; tipoPessoa: "PF" | "PJ"; uf: string | null; cidade: string | null };
  credor: { nome: string; uf: string | null };
  fatos: Fatos;
  titulos: TituloJuridico[];
  documentos: DocumentoJuridico[];
};
export type Fundamento = { chave: string; artigos: (number | string)[]; motivo: string };
export type Triagem = {
  medida: string; alternativa: string; confianca: number; forca: "ALTA" | "MÉDIA" | "BAIXA";
  sinais: Record<string, boolean | number>; pendencias: string[]; riscos: string[]; fundamentos: Fundamento[];
};
export type Trecho = { chave: string; fonte: string; url: string; artigo: string; texto: string };

// "R$ 1.234,56" com espaço comum: a minuta é texto puro e o espaço rígido do toLocaleString aparece
// estranho em editor de texto.
const reais = (v: number) => brl(v).replace(/ /g, " ");

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const diaUTC = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const diasEntre = (de: string, ate: string) => Math.round((diaUTC(ate) - diaUTC(de)) / 86_400_000);
const dataValida = (s: string | null | undefined): string | null => {
  const v = String(s ?? "").slice(0, 10);
  if (!ISO.test(v)) return null;
  const d = new Date(diaUTC(v));
  return d.toISOString().slice(0, 10) === v ? v : null;
};
const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

// Valores em reais e datas encontrados no texto dos documentos, para o advogado comparar com a ficha.
export function extrairValoresEDatas(texto: string): { valores: number[]; datas: string[]; anos: number[] } {
  const t = texto || "";
  const valores: number[] = [];
  for (const m of t.matchAll(/R\$\s*([0-9.]+(?:,[0-9]{1,2})?)/gi)) {
    const v = Number.parseFloat(m[1].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(v) && v > 0) {
      const r = Math.round(v * 100) / 100;
      if (!valores.includes(r)) valores.push(r);
    }
    if (valores.length >= 20) break;
  }
  const datas: string[] = [];
  const anos = new Set<number>();
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|19\d{2})\b/g)) {
    const iso = dataValida(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
    if (iso) {
      if (!datas.includes(iso)) datas.push(iso);
      anos.add(Number(m[3]));
    }
    if (datas.length >= 30) break;
  }
  for (const m of t.matchAll(/\b(20\d{2}|19\d{2})\b/g)) anos.add(Number(m[1]));
  return { valores, datas, anos: [...anos].sort((a, b) => a - b) };
}

const textoDoDocumento = (d: DocumentoJuridico) => [d.tipo, d.nome, d.observacao, d.texto].filter(Boolean).join(" ");

export function montarFatos(input: { saldo: number; titulos: TituloJuridico[]; documentos: DocumentoJuridico[]; hoje: string }): Fatos {
  const vencs = input.titulos.map((t) => dataValida(t.vencimento)).filter((x): x is string => !!x).sort();
  const anos = [...new Set(vencs.map((v) => Number(v.slice(0, 4))))].sort((a, b) => a - b);
  const hoje = dataValida(input.hoje) ?? new Date().toISOString().slice(0, 10);
  const doc = extrairValoresEDatas(input.documentos.map(textoDoDocumento).join("\n"));
  const saldo = Number(input.saldo) || 0;
  return {
    saldo,
    saldoTexto: reais(saldo),
    titulos: input.titulos.length,
    primeiroVenc: vencs[0] ?? null,
    ultimoVenc: vencs[vencs.length - 1] ?? null,
    anos,
    diasAtraso: vencs[0] ? Math.max(0, diasEntre(vencs[0], hoje)) : 0,
    valoresDocumentos: doc.valores,
    datasDocumentos: doc.datas,
    anosDocumentos: doc.anos,
  };
}

// Sem acento, minúsculo e com espaço único: "Confissão de Dívida" e "confissao de divida" são a mesma coisa.
const normalizar = (v: unknown) =>
  String(v ?? "").normalize("NFKD").replace(/[^\x00-\x7F]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function sinaisDocumentais(documentos: DocumentoJuridico[], titulos: TituloJuridico[]): Record<string, boolean | number> {
  const corpus = documentos.map((d) => normalizar(textoDoDocumento(d))).join(" ");
  const titulosCorpus = titulos.map((t) => normalizar(`${t.especie ?? ""} ${t.descricao ?? ""} ${t.origem ?? ""}`)).join(" ");
  const tudo = `${corpus} ${titulosCorpus}`;
  const tem = (...termos: string[]) => termos.some((x) => tudo.includes(x));
  return {
    cheque: tem("cheque"),
    duplicata: tem("duplicat"),
    nota_promissoria: tem("promiss"),
    confissao_divida: tem("confissao") && tem("divid"),
    contrato: tem("contrat"),
    boleto: tem("boleto"),
    nota_fiscal: tem("nota fiscal", "nf-e", "nfe"),
    protesto: tem("protest"),
    comprovante_entrega: tem("comprovante de entrega", "canhoto", "entrega", "recebimento mercadoria"),
    duas_testemunhas: tem("duas testemunhas", "2 testemunhas", "testemunhas assin"),
    assinatura: tem("assinado", "assinatura", "assinad"),
    acordo: tem("acordo"),
    pagamento_parcial: tem("pagamento parcial", "parcialmente pago", "abatimento"),
    document_count: documentos.length,
  };
}

const JUNTAR_DOCUMENTOS = "Juntar documentos que comprovem a origem e a exigibilidade do débito.";

/**
 * Triagem conservadora, regra por regra igual ao LEGAL-V1.1: usa só fatos estruturados e sinais dos
 * documentos. Prescrição cadastrada já vencida derruba a confiança; nada é presumido.
 */
export function triagemDeterministica(ctx: ContextoJuridico): Triagem {
  const titulos = ctx.titulos ?? [];
  const docs = ctx.documentos ?? [];
  const s = sinaisDocumentais(docs, titulos);
  const hoje = dataValida(ctx.hoje) ?? new Date().toISOString().slice(0, 10);

  const pendencias: string[] = [];
  const riscos: string[] = [];
  const fundamentos: Fundamento[] = [{ chave: "planalto_cpc", artigos: [319, 320], motivo: "requisitos gerais da petição inicial e documentos indispensáveis" }];
  let medida = "Ação de cobrança";
  let alternativa = "Ação monitória";
  let confianca = 48;
  let forca: Triagem["forca"] = "MÉDIA";

  const prescricoes: string[] = [];
  const vencidas: string[] = [];
  const proximas: string[] = [];
  for (const t of titulos) {
    const p = dataValida(t.prescricao);
    if (!p) continue;
    prescricoes.push(p);
    if (p < hoje) vencidas.push(p);
    else if (diasEntre(hoje, p) <= 180) proximas.push(p);
  }
  if (vencidas.length) riscos.push("Há título com data de prescrição cadastrada já ultrapassada; conferir causa interruptiva/suspensiva e via residual antes de ajuizar.");
  if (proximas.length) riscos.push("Há título com data de prescrição cadastrada a até 180 dias; priorizar conferência jurídica.");
  if (!prescricoes.length) riscos.push("Nenhum título possui data de prescrição cadastrada; o sistema não tratará a prescrição como definitivamente resolvida.");

  const execucaoCPC: Fundamento = { chave: "planalto_cpc", artigos: [784, 798, 824, 829], motivo: "título executivo e procedimento executivo" };
  const prescricaoCivil: Fundamento = { chave: "planalto_cc", artigos: [189, 205, 206], motivo: "pretensão e prescrição civil" };

  if (s.cheque) {
    fundamentos.push(
      { chave: "planalto_cheque", artigos: [33, 47, 59, 61], motivo: "apresentação, execução e prazos próprios do cheque" },
      execucaoCPC,
    );
    if (prescricoes.length && !vencidas.length) {
      medida = "Execução de título extrajudicial";
      alternativa = "Ação monitória / cobrança, se a força executiva não estiver disponível";
      confianca = 78;
      forca = "ALTA";
    } else {
      medida = "Ação monitória";
      alternativa = "Ação de cobrança";
      confianca = 61;
      forca = "MÉDIA";
      pendencias.push("Conferir data de emissão, praça, apresentação e prazo executivo específico do cheque.");
    }
  } else if (s.duplicata) {
    fundamentos.push(
      { chave: "planalto_duplicata", artigos: [15, 18], motivo: "requisitos de cobrança executiva e prescrição da duplicata" },
      { chave: "planalto_cpc", artigos: [784, 798, 824, 829], motivo: "execução de título extrajudicial" },
    );
    if (s.protesto && s.comprovante_entrega) {
      medida = "Execução de título extrajudicial";
      alternativa = "Ação monitória";
      confianca = 84;
      forca = "ALTA";
    } else {
      medida = "Ação monitória";
      alternativa = "Execução, se forem comprovados os requisitos documentais da duplicata";
      confianca = 66;
      forca = "MÉDIA";
      if (!s.protesto) pendencias.push("Protesto/elemento equivalente não identificado nos documentos cadastrados.");
      if (!s.comprovante_entrega) pendencias.push("Comprovante de entrega/recebimento da mercadoria ou serviço não identificado.");
    }
  } else if (s.nota_promissoria) {
    fundamentos.push({ chave: "planalto_cpc", artigos: [784, 798, 824, 829], motivo: "título executivo extrajudicial e execução" });
    if (prescricoes.length && !vencidas.length) {
      medida = "Execução de título extrajudicial";
      alternativa = "Ação monitória";
      confianca = 80;
      forca = "ALTA";
    } else {
      medida = "Ação monitória";
      alternativa = "Ação de cobrança";
      confianca = 60;
      pendencias.push("Conferir prazo cambial/prescrição e integridade formal da nota promissória.");
    }
  } else if (s.confissao_divida || (s.contrato && s.duas_testemunhas)) {
    fundamentos.push({ chave: "planalto_cpc", artigos: [784, 798, 824, 829], motivo: "título executivo extrajudicial e execução" }, prescricaoCivil);
    medida = "Execução de título extrajudicial";
    alternativa = "Ação monitória";
    confianca = s.duas_testemunhas ? 86 : 72;
    forca = s.duas_testemunhas ? "ALTA" : "MÉDIA";
    if (!s.duas_testemunhas) pendencias.push("Confirmar requisito formal que atribua força executiva ao instrumento.");
  } else if (s.contrato || s.boleto || s.nota_fiscal || docs.length) {
    fundamentos.push({ chave: "planalto_cpc", artigos: [700, 701], motivo: "prova escrita e procedimento monitório" }, prescricaoCivil);
    medida = "Ação monitória";
    alternativa = "Ação de cobrança";
    confianca = docs.length ? 70 : 58;
    forca = "MÉDIA";
    if (!docs.length) pendencias.push("Juntar prova escrita da obrigação e do inadimplemento.");
  } else {
    fundamentos.push(prescricaoCivil);
    medida = "Ação de cobrança";
    alternativa = "Ação monitória, se houver prova escrita suficiente";
    confianca = 45;
    forca = "BAIXA";
    pendencias.push("Documentação da origem da dívida não foi identificada de forma suficiente.");
  }

  if (!titulos.length) {
    confianca = Math.min(confianca, 35);
    forca = "BAIXA";
    pendencias.push("Nenhum título financeiro cadastrado para o cliente.");
  }
  if (!docs.length) {
    confianca = Math.min(confianca, 62);
    if (!pendencias.includes(JUNTAR_DOCUMENTOS)) pendencias.push(JUNTAR_DOCUMENTOS);
  }
  // Com alerta objetivo de prescrição no cadastro, a triagem não pode soar como certeza.
  if (vencidas.length) confianca = Math.min(confianca, 40);

  return {
    medida,
    alternativa,
    confianca: Math.max(0, Math.min(100, Math.trunc(confianca))),
    forca,
    sinais: s,
    pendencias,
    riscos,
    fundamentos,
  };
}

// Toda fonte citada na fundamentação, na ordem. A jurisprudência não entra aqui: ela é pesquisada por
// caso, e um portal que recusa o teste automático (403/CAPTCHA) não pode travar a aprovação.
export function chavesDasFontes(fundamentos: Fundamento[]): string[] {
  const chaves: string[] = [];
  for (const f of fundamentos ?? []) if (f.chave && !chaves.includes(f.chave)) chaves.push(f.chave);
  return chaves;
}

export function minutaPadrao(ctx: ContextoJuridico, triagem: Triagem, trechos: Trecho[]): string {
  const f = ctx.fatos;
  const medida = triagem.medida || "Ação de cobrança";
  const linhas = [
    "MINUTA JURÍDICA AUTOMÁTICA — MC COB",
    "DOCUMENTO PARA REVISÃO E APROVAÇÃO DO ADVOGADO — NÃO PROTOCOLAR SEM CONFERÊNCIA",
    "",
    `MEDIDA SUGERIDA: ${medida}`,
    `ALTERNATIVA: ${triagem.alternativa || "—"}`,
    `CONFIANÇA DA TRIAGEM: ${triagem.confianca ?? 0}%`,
    "",
    "I — PARTES",
    `Credor: ${ctx.credor?.nome || "—"}`,
    `Devedor: ${ctx.devedor?.nome || "—"}`,
    `CPF/CNPJ do devedor: ${ctx.devedor?.documento || "não informado"}`,
    "",
    "II — QUADRO DA DÍVIDA",
    `Saldo aberto apurado no MC COB: ${f?.saldoTexto || "—"}`,
    `Quantidade de títulos em aberto: ${f?.titulos ?? 0}`,
    `Primeiro vencimento: ${dataBR(f?.primeiroVenc ?? null) || "—"}`,
    `Último vencimento: ${dataBR(f?.ultimoVenc ?? null) || "—"}`,
    `Anos dos vencimentos: ${(f?.anos ?? []).join(", ") || "—"}`,
    "",
    "III — FATOS",
    "Conforme os registros financeiros e documentos cadastrados no MC COB, existe obrigação vencida e não integralmente satisfeita. Antes do protocolo, conferir a origem da obrigação, a prova da entrega/prestação, eventuais pagamentos, renegociações, novações e causas que possam interferir na exigibilidade ou prescrição.",
    "",
    "IV — ENQUADRAMENTO JURÍDICO",
    `A triagem automatizada indicou ${medida}. A conclusão é assistida e depende da conferência dos requisitos formais do título, dos documentos e da legislação vigente na data juridicamente relevante.`,
    "",
    "V — BASE OFICIAL SINCRONIZADA",
  ];
  if (trechos.length) {
    for (const t of trechos) linhas.push(`- ${t.fonte || "Fonte oficial"} · art. ${t.artigo}: ${(t.texto ?? "").slice(0, 900)}`);
  } else {
    linhas.push("- Trechos oficiais ainda não materializados. Sincronizar fontes antes de finalizar a peça.");
  }
  linhas.push(
    "",
    "VI — PEDIDOS / PROVIDÊNCIAS A CONFERIR",
    "1. Adequar endereçamento, competência e rito ao caso concreto.",
    "2. Conferir legitimidade, liquidez, certeza e exigibilidade da obrigação.",
    "3. Anexar documentos indispensáveis e memória de cálculo.",
    "4. Revisar prescrição/decadência e fatos interruptivos ou suspensivos.",
    "5. Adequar pedidos executivos/cognitivos à medida efetivamente aprovada pelo advogado.",
    "",
    "VII — PENDÊNCIAS APONTADAS PELO MOTOR",
  );
  for (const item of [...(triagem.pendencias ?? []), ...(triagem.riscos ?? [])]) linhas.push(`- ${item}`);
  linhas.push("", "[FIM DA MINUTA AUTOMÁTICA — REVISÃO HUMANA OBRIGATÓRIA]");
  return linhas.join("\n");
}
