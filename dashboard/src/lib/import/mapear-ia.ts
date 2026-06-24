// Pede à IA uma "receita" de de-para a partir de uma AMOSTRA da planilha.
// A IA só decide ESTRUTURA (qual coluna é cada campo, linha do cabeçalho, transform);
// o código aplica a receita de forma determinística (ver parse-planilha.ts).
import {
  CAMPOS_RECEITA, TRANSFORMS_RECEITA, type Receita, type CampoReceita, type TransformReceita,
} from "./parse-planilha";

const OPENAI = "https://api.openai.com/v1/chat/completions";

const DESCRICAO_CAMPOS = `Campos de DESTINO (use só estes; omita os que não existirem na planilha):
- cpf: CPF ou CNPJ do devedor (obrigatório).
- nome: nome do devedor (obrigatório).
- saldo: valor da dívida em reais (obrigatório).
- telefone: telefone/celular principal (obrigatório).
- telefone2: telefone/celular adicional (opcional).
- vencimento: data da dívida / vencimento (opcional).
- cidade, uf: localização (opcional).
- referencia: nº de contrato/processo/código (opcional).
- email: e-mail (opcional).`;

const DESCRICAO_TRANSFORMS = `Transformações (campo "transform"; escolha UMA por campo):
- nenhum: usa a célula como está (padrão).
- centavos: a célula é um inteiro em centavos (ex.: 150000 = R$ 1.500,00).
- extrair_documento: a célula tem o CPF/CNPJ misturado a outro texto (ex.: "João - 123.456.789-00").
- extrair_telefones: a célula tem telefone(s) misturado(s) a outro texto.
- juntar: o campo vem da junção de 2+ colunas (ex.: nome + sobrenome). Liste todas em "colunas".
- so_digitos: mantém apenas os dígitos da célula.`;

function montarAmostra(grade: unknown[][], maxRows: number): { texto: string; nColunas: number } {
  const linhas = grade.slice(0, maxRows);
  const nColunas = linhas.reduce((m, r) => Math.max(m, (r ?? []).length), 0);
  const linhasTxt = linhas.map((r, i) => {
    const cells = Array.from({ length: nColunas }, (_, c) => {
      const v = (r ?? [])[c];
      const s = v === null || v === undefined ? "" : String(v);
      return s.length > 40 ? s.slice(0, 40) + "…" : s;
    });
    return `${i} : ${JSON.stringify(cells)}`;
  });
  return { texto: linhasTxt.join("\n"), nColunas };
}

// Valida e "limpa" o que a IA devolveu, garantindo o schema fechado.
export function validarReceita(bruto: any, nColunas: number): Receita {
  const dentro = (c: unknown) => Number.isInteger(c) && (c as number) >= 0 && (c as number) < nColunas;
  const campos: Receita["campos"] = {};
  const brutoCampos = bruto?.campos ?? {};
  for (const campo of CAMPOS_RECEITA) {
    const regra = brutoCampos[campo as CampoReceita];
    if (!regra) continue;
    const colunas = (Array.isArray(regra.colunas) ? regra.colunas : [regra.coluna])
      .filter(dentro) as number[];
    if (colunas.length === 0) continue;
    const transform: TransformReceita = TRANSFORMS_RECEITA.includes(regra.transform) ? regra.transform : "nenhum";
    campos[campo] = { colunas, transform };
  }
  const linha_cabecalho = Number.isInteger(bruto?.linha_cabecalho) ? bruto.linha_cabecalho : -1;
  let linha_dados_inicio = Number.isInteger(bruto?.linha_dados_inicio)
    ? bruto.linha_dados_inicio
    : Math.max(0, linha_cabecalho + 1);
  // os dados nunca começam na linha do cabeçalho (ou antes dela)
  if (linha_cabecalho >= 0 && linha_dados_inicio <= linha_cabecalho) linha_dados_inicio = linha_cabecalho + 1;
  if (linha_dados_inicio < 0) linha_dados_inicio = 0;
  return {
    linha_cabecalho,
    linha_dados_inicio,
    campos,
    observacoes: typeof bruto?.observacoes === "string" ? bruto.observacoes.slice(0, 600) : undefined,
  };
}

export async function mapearComIA(opts: {
  apiKey: string; modelo: string; grade: unknown[][]; maxRows?: number;
}): Promise<Receita> {
  const { apiKey, modelo, grade, maxRows = 15 } = opts;
  const { texto, nColunas } = montarAmostra(grade, maxRows);

  const sistema = `Você organiza planilhas de cobrança para um formato padrão. Recebe uma AMOSTRA
das primeiras linhas de uma planilha (com índices de coluna 0-based) e devolve um JSON ("receita")
indicando de qual COLUNA vem cada campo de destino, qual a linha do cabeçalho e qual transformação aplicar.

${DESCRICAO_CAMPOS}

${DESCRICAO_TRANSFORMS}

Regras:
- Identifique "linha_cabecalho" (índice 0-based da linha de títulos; -1 se não houver cabeçalho) e
  "linha_dados_inicio" (índice da 1ª linha de dados, ignorando títulos/linhas em branco no topo).
- Em "campos", para cada campo use { "colunas": [índices], "transform": "..." }. Use só índices que existem.
- Inclua SEMPRE os obrigatórios (cpf, nome, saldo, telefone) se houver como deduzi-los.
- Responda APENAS com JSON válido, sem comentários, no formato:
  {"linha_cabecalho":N,"linha_dados_inicio":N,"campos":{"cpf":{"colunas":[i],"transform":"nenhum"},...},"observacoes":"resumo em português"}`;

  const usuario = `Número de colunas: ${nColunas}\nAmostra (índice : células):\n${texto}`;

  const r = await fetch(OPENAI, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: "system", content: sistema }, { role: "user", content: usuario }],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    throw new Error(`openai_falhou_${r.status}: ${detalhe.slice(0, 300)}`);
  }
  const data = await r.json();
  const conteudo = data?.choices?.[0]?.message?.content;
  if (!conteudo) throw new Error("openai_sem_resposta");
  let bruto: any;
  try { bruto = JSON.parse(conteudo); } catch { throw new Error("openai_json_invalido"); }
  return validarReceita(bruto, nColunas);
}
