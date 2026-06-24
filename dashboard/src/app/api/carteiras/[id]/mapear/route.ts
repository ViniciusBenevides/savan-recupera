import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarCarteira, erroDono } from "@/lib/auth";
import { getSegredo } from "@/lib/segredos";
import { getConfigEscopo } from "@/lib/config";
import { lerGrade, previewReceita, CAMPOS_OBRIGATORIOS, type Receita } from "@/lib/import/parse-planilha";
import { mapearComIA, validarReceita } from "@/lib/import/mapear-ia";

export const runtime = "nodejs";

// POST (multipart): analisa uma planilha "fora do padrão" e devolve a RECEITA proposta
// (de-para campo↔coluna) + uma prévia normalizada — SEM gravar nada no banco.
// Se vier um campo `receita` no form, pula a IA e só re-aplica/re-previsualiza (edição manual).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const carteiraId = Number(id);

  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarCarteira(g.sessao, carteiraId))) return erroDono();

  const admin = supabaseAdmin();
  const { data: carteira } = await admin.from("carteiras").select("id, cobrador_id").eq("id", carteiraId).maybeSingle();
  if (!carteira) return NextResponse.json({ erro: "carteira_nao_encontrada" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("arquivo");
  if (!(file instanceof File)) return NextResponse.json({ erro: "arquivo_ausente" }, { status: 400 });

  let grade: unknown[][];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    grade = lerGrade(buf).linhas;
  } catch (e: any) {
    return NextResponse.json({ erro: `nao_foi_possivel_ler: ${String(e?.message ?? e)}` }, { status: 400 });
  }
  if (grade.length < 2) return NextResponse.json({ erro: "planilha_vazia" }, { status: 400 });
  const nColunas = grade.reduce((m, r) => Math.max(m, (r ?? []).length), 0);

  // Edição manual: o front reenvia a receita ajustada → só re-aplica/previsualiza.
  let receita: Receita;
  const receitaForm = form.get("receita");
  if (typeof receitaForm === "string" && receitaForm.trim()) {
    try { receita = validarReceita(JSON.parse(receitaForm), nColunas); }
    catch { return NextResponse.json({ erro: "receita_invalida" }, { status: 400 }); }
  } else {
    // Primeira análise: precisa da chave OpenAI do cobrador (ou global) + modelo configurado.
    const apiKey = await getSegredo("OPENAI_API_KEY", g.sessao.tenant);
    if (!apiKey) return NextResponse.json({ erro: "openai_key_ausente" }, { status: 400 });
    const cfgEscopo = await getConfigEscopo(carteira.cobrador_id ?? g.sessao.tenant);
    const modelo = (cfgEscopo.ia as any)?.modelo ?? "gpt-4.1-mini";
    try {
      receita = await mapearComIA({ apiKey, modelo, grade });
    } catch (e: any) {
      return NextResponse.json({ erro: `ia_falhou: ${String(e?.message ?? e)}` }, { status: 502 });
    }
  }

  // colunas (rótulos a partir da linha de cabeçalho, se houver) p/ os seletores da revisão
  const cabecalho = receita.linha_cabecalho >= 0 ? (grade[receita.linha_cabecalho] ?? []) : [];
  const colunas = Array.from({ length: nColunas }, (_, i) => {
    const t = cabecalho[i];
    const titulo = t === null || t === undefined || String(t).trim() === "" ? `Coluna ${i + 1}` : String(t).trim();
    return { idx: i, titulo };
  });

  const faltando = CAMPOS_OBRIGATORIOS.filter((c) => !receita.campos[c]);

  const { devedores } = previewReceita(grade, receita, 3);
  const preview = devedores.map((d) => ({
    cpf_cnpj: d.cpf_cnpj,
    nome: d.nome,
    saldo: d.saldo,
    vencimento: d.vencimento,
    cidade: d.cidade,
    uf: d.uf,
    telefones: d.telefones.map((t) => t.telefone_e164),
  }));

  return NextResponse.json({ receita, colunas, faltando, observacoes: receita.observacoes ?? null, preview });
}
