// Camada de IA do Jurídico automático (porte do MC COB V5.7.01): pesquisa de jurisprudência restrita a
// domínios oficiais e o raciocínio argumentativo (tese, antítese, estratégia, minuta). A IA nunca
// recebe nome, CPF/CNPJ, telefone, endereço nem o texto bruto dos documentos do devedor.
import { urlEmDominioPermitido } from "@/lib/juridico/fontes";
import type { ContextoJuridico, Triagem, Trecho } from "@/lib/juridico/motor";

const RESPONSES = "https://api.openai.com/v1/responses";

export type PrecedenteIA = { tribunal: string; processo: string; tipo: string; data: string; tese: string; relevancia: string; url: string };
export type PesquisaJurisprudencia = {
  ativa: boolean; pesquisadaEm?: string; dominios?: string[]; resumo: string;
  precedentes: PrecedenteIA[]; fontes: { url: string; titulo: string }[];
};
export type RaciocinioIA = { fundamentacao: string; defesa: string; estrategia: string; minuta: string };
export type PrecedenteCadastrado = {
  tribunal: string; processo: string | null; tema: string | null; tese: string; nivel: string; publicado_em: string | null; url_oficial: string;
};

async function chamarResponses(apiKey: string, corpo: Record<string, unknown>, timeoutMs: number): Promise<any> {
  const ctrl = new AbortController();
  const relogio = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(RESPONSES, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!r.ok) {
      const detalhe = await r.text().catch(() => "");
      throw new Error(`openai_falhou_${r.status}: ${detalhe.slice(0, 300)}`);
    }
    return await r.json();
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`openai_tempo_esgotado_${Math.round(timeoutMs / 1000)}s`);
    throw e;
  } finally {
    clearTimeout(relogio);
  }
}

// O texto final da Responses API vem em output[].content[] do tipo "output_text".
function textoDaResposta(payload: any): string {
  const partes: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const c of Array.isArray(item?.content) ? item.content : []) {
      if (c?.type === "output_text" && typeof c.text === "string") partes.push(c.text);
    }
  }
  if (partes.length) return partes.join("\n");
  return typeof payload?.output_text === "string" ? payload.output_text : "";
}

// Primeiro objeto {...} balanceado do texto (o modelo às vezes embrulha o JSON em comentário ou cerca).
function extrairObjetoJSON(texto: string): Record<string, any> | null {
  const s = texto || "";
  for (let inicio = s.indexOf("{"); inicio !== -1; inicio = s.indexOf("{", inicio + 1)) {
    let nivel = 0;
    let emString = false;
    let escape = false;
    for (let i = inicio; i < s.length; i++) {
      const ch = s[i];
      if (emString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') emString = false;
        continue;
      }
      if (ch === '"') emString = true;
      else if (ch === "{") nivel++;
      else if (ch === "}") {
        nivel--;
        if (nivel === 0) {
          try {
            const obj = JSON.parse(s.slice(inicio, i + 1));
            if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj;
          } catch { /* tenta o próximo "{" */ }
          break;
        }
      }
    }
  }
  return null;
}

// URLs que o web_search de fato consultou (para mostrar ao advogado o que foi lido).
function fontesDaPesquisa(payload: any): { url: string; titulo: string }[] {
  const out: { url: string; titulo: string }[] = [];
  const vistos = new Set<string>();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (!item || typeof item !== "object") continue;
    const candidatos = [
      ...(Array.isArray(item.action?.sources) ? item.action.sources : []),
      ...(Array.isArray(item.sources) ? item.sources : []),
    ];
    for (const src of candidatos) {
      const url = String(src?.url ?? "").trim();
      if (!url || vistos.has(url)) continue;
      vistos.add(url);
      out.push({ url, titulo: String(src?.title ?? "").slice(0, 300) });
    }
  }
  return out.slice(0, 40);
}

const corte = (v: unknown, n: number) => String(v ?? "").slice(0, n);

/**
 * Pesquisa jurisprudência atual SOMENTE nos domínios oficiais (STJ/STF sempre; TJGO ou TJMT pela UF).
 * Recebe contexto anonimizado. Qualquer falha é lançada: quem chama decide seguir sem a pesquisa.
 */
export async function pesquisarJurisprudencia(o: {
  apiKey: string; modelo: string; ctx: ContextoJuridico; triagem: Triagem; timeoutMs?: number;
}): Promise<PesquisaJurisprudencia> {
  const { ctx, triagem } = o;
  const uf = (ctx.devedor?.uf || ctx.credor?.uf || "").toUpperCase().trim();
  const dominios = ["stj.jus.br", "stf.jus.br"];
  if (uf === "GO") dominios.push("tjgo.jus.br", "projudi.tjgo.jus.br");
  else if (uf === "MT") dominios.push("tjmt.jus.br", "jurisprudencia.tjmt.jus.br");
  // Fora de GO/MT a pesquisa fica nos tribunais superiores até o domínio do tribunal estadual ser validado.

  const tiposTitulo = [...new Set((ctx.titulos ?? []).map((t) => (t.especie || t.origem || "").trim()).filter(Boolean))].sort();
  const tiposDocumento = [...new Set((ctx.documentos ?? []).map((d) => (d.tipo || "").trim()).filter(Boolean))].sort();
  const contextoConsulta = {
    data: ctx.hoje,
    uf,
    medida_sugerida: triagem.medida,
    alternativa: triagem.alternativa,
    tipos_titulo: tiposTitulo,
    tipos_documento: tiposDocumento,
    anos_vencimento: ctx.fatos?.anos ?? [],
    alertas: triagem.riscos ?? [],
    fundamentos: triagem.fundamentos ?? [],
  };
  const prompt = `Pesquise jurisprudência brasileira ATUAL E RELEVANTE para uma análise de cobrança judicial, usando exclusivamente os domínios oficiais permitidos pelo sistema. Contexto anonimizado: ${JSON.stringify(contextoConsulta)}

Priorize, nesta ordem: precedentes qualificados/repetitivos e súmulas do STJ/STF; depois decisões do tribunal estadual competente, quando o domínio estiver liberado. Não invente número de processo, tema, súmula, tese, data, relator ou URL. Se a busca não localizar decisão suficientemente específica, declare isso. Diferencie precedente vinculante/qualificado de julgado persuasivo.

Retorne APENAS JSON válido com esta estrutura:
{"summary":"síntese objetiva do que a pesquisa oficial encontrou","precedents":[{"tribunal":"","process_number":"","kind":"repetitivo|sumula|repercussao_geral|acordao|decisao","date":"AAAA-MM-DD ou vazio","thesis":"","relevance":"","url":"https://dominio-oficial/..."}]}`;

  const payload = await chamarResponses(o.apiKey, {
    model: o.modelo,
    store: false,
    tools: [{ type: "web_search", filters: { allowed_domains: dominios }, search_context_size: "medium" }],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    input: prompt,
    max_output_tokens: 1800,
  }, o.timeoutMs ?? 25000);

  const obj = extrairObjetoJSON(textoDaResposta(payload));
  const precedentes: PrecedenteIA[] = [];
  for (const p of Array.isArray(obj?.precedents) ? obj!.precedents : []) {
    if (!p || typeof p !== "object") continue;
    const url = String(p.url ?? "").trim();
    // Só fica o que aponta para página oficial liberada: precedente sem fonte auditável não serve.
    if (!url.startsWith("https://") || !urlEmDominioPermitido(url, dominios)) continue;
    precedentes.push({
      tribunal: corte(p.tribunal, 40),
      processo: corte(p.process_number, 120),
      tipo: corte(p.kind, 60),
      data: corte(p.date, 20),
      tese: corte(p.thesis, 2200),
      relevancia: corte(p.relevance, 1200),
      url: url.slice(0, 700),
    });
  }
  const fontes = fontesDaPesquisa(payload).filter((f) => urlEmDominioPermitido(f.url, dominios));
  return {
    ativa: true,
    pesquisadaEm: new Date().toISOString(),
    dominios,
    resumo: obj
      ? corte(obj.summary || "Pesquisa oficial concluída sem síntese estruturada.", 5000)
      : "Pesquisa oficial concluída.",
    precedentes: precedentes.slice(0, 12),
    fontes: fontes.slice(0, 30),
  };
}

const INSTRUCOES = `Atue como advogado brasileiro sênior em Direito Civil e Processo Civil, com foco em recuperação judicial de créditos. Você é uma camada de RACIOCÍNIO JURÍDICO ASSISTIDO do MC COB, não um sistema de protocolo.
REGRAS ABSOLUTAS:
1) Separe fato comprovado, fato não comprovado, inferência e conclusão jurídica.
2) Use SOMENTE os trechos oficiais, precedentes validados e resultados da pesquisa jurisprudencial oficial fornecidos. Nunca invente artigo, súmula, tema, processo, tribunal, ementa ou URL.
3) Se não houver precedente específico validado ou localizado em fonte oficial, escreva expressamente que não foi localizado precedente específico suficiente para esta análise.
4) Faça tese e antítese: indique a melhor medida do credor e a defesa provável do devedor.
5) Analise prescrição com prudência. Se faltarem datas/eventos interruptivos, trate como pendência, não como certeza.
6) Não altere silenciosamente a medida da triagem determinística. Se discordar, explique em strategy e mantenha a medida como recomendação sujeita à revisão.
7) A minuta deve conter placeholders [CREDOR], [DEVEDOR], [DOCUMENTO_DEVEDOR], [COMARCA], [VARA] e nunca inventar qualificação/endereço.
8) Não protocole, não afirme que o processo foi ajuizado e não crie fatos.
9) Retorne APENAS JSON válido com: reasoning_summary, defense_simulation, strategy, draft_petition_body.
10) reasoning_summary, defense_simulation e strategy devem ser objetivos e auditáveis, sem expor raciocínio interno passo a passo.`;

/**
 * Tese, antítese, estratégia e corpo da minuta. Erro de rede/HTTP é lançado (quem chama segue com a
 * triagem determinística); resposta sem JSON utilizável volta como `dados: null`.
 * Os placeholders [CREDOR], [DEVEDOR] e [DOCUMENTO_DEVEDOR] são trocados por quem chama, localmente.
 */
export async function raciocinioJuridico(o: {
  apiKey: string; modelo: string; ctx: ContextoJuridico; triagem: Triagem; trechos: Trecho[];
  precedentes: PrecedenteCadastrado[]; pesquisa: PesquisaJurisprudencia; timeoutMs?: number;
}): Promise<{ dados: RaciocinioIA | null; modelo: string }> {
  const { ctx } = o;
  const contextoSeguro = {
    data_analise: ctx.hoje,
    devedor: { tipo_pessoa: ctx.devedor?.tipoPessoa, uf: ctx.devedor?.uf },
    credor: { uf: ctx.credor?.uf },
    fatos: ctx.fatos,
    titulos: (ctx.titulos ?? []).map((t) => ({
      especie: t.especie, descricao: t.descricao, origem: t.origem, emissao: t.emissao, vencimento: t.vencimento,
      valor_original: t.valorOriginal, valor_atual: t.valorAtual, prescricao: t.prescricao, situacao: t.situacao,
    })),
    documentos: (ctx.documentos ?? []).map((d) => ({ tipo: d.tipo, tem_arquivo: d.temArquivo })),
    triagem_deterministica: o.triagem,
    normas_oficiais_sincronizadas: (o.trechos ?? []).slice(0, 18),
    precedentes_validados: (o.precedentes ?? []).slice(0, 10).map((p) => ({
      tribunal: p.tribunal, processo: p.processo, tema: p.tema, tese: p.tese, nivel: p.nivel, publicacao: p.publicado_em ?? "", url: p.url_oficial,
    })),
    pesquisa_jurisprudencial_oficial_atual: o.pesquisa ?? {},
  };

  const payload = await chamarResponses(o.apiKey, {
    model: o.modelo,
    store: false,
    instructions: INSTRUCOES,
    input: JSON.stringify(contextoSeguro),
    max_output_tokens: 2600,
  }, o.timeoutMs ?? 30000);

  const obj = extrairObjetoJSON(textoDaResposta(payload));
  if (!obj) return { dados: null, modelo: o.modelo };
  return {
    dados: {
      fundamentacao: corte(obj.reasoning_summary, 7000),
      defesa: corte(obj.defense_simulation, 7000),
      estrategia: corte(obj.strategy, 7000),
      minuta: corte(obj.draft_petition_body, 30000),
    },
    modelo: o.modelo,
  };
}
