import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { exigirSessao } from "@/lib/auth";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
const BUCKET_IMPORTACOES = "importacoes-carteiras";
const LIMITE_LINHAS = 100;
const LIMITE_COLUNAS = 40;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; importacaoId: string }> },
) {
  const guarda = await exigirSessao();
  if (guarda.erro) return guarda.erro;

  const { id, importacaoId } = await params;
  const carteiraId = Number(id);
  const importacaoNumero = Number(importacaoId);
  if (!Number.isInteger(carteiraId) || !Number.isInteger(importacaoNumero)) {
    return NextResponse.json({ erro: "importacao_invalida" }, { status: 400 });
  }

  // A consulta com o cliente da sessão aplica a RLS da carteira antes de o service role tocar no arquivo.
  const sb = await supabaseServer();
  const { data: importacao } = await sb.from("importacoes")
    .select("id, arquivo_nome, arquivo_path, arquivo_mime, arquivo_tamanho")
    .eq("id", importacaoNumero)
    .eq("carteira_id", carteiraId)
    .maybeSingle();

  if (!importacao) return NextResponse.json({ erro: "importacao_nao_encontrada" }, { status: 404 });
  if (!importacao.arquivo_path) {
    return NextResponse.json({
      erro: "arquivo_original_nao_armazenado",
      mensagem: "Esta importação é anterior ao visualizador e não possui o arquivo original armazenado.",
    }, { status: 409 });
  }

  const admin = supabaseAdmin();
  const { data: arquivo, error } = await admin.storage.from(BUCKET_IMPORTACOES).download(importacao.arquivo_path);
  if (error || !arquivo) return NextResponse.json({ erro: "arquivo_nao_encontrado" }, { status: 404 });

  const url = new URL(req.url);
  const modo = url.searchParams.get("modo") ?? "preview";
  const buffer = Buffer.from(await arquivo.arrayBuffer());

  if (modo === "download") {
    const nomeAscii = String(importacao.arquivo_nome).replace(/["\r\n]/g, "_");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": importacao.arquivo_mime || "application/octet-stream",
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(importacao.arquivo_nome)}`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const abaPedida = url.searchParams.get("aba");
    const aba = abaPedida && workbook.SheetNames.includes(abaPedida) ? abaPedida : workbook.SheetNames[0];
    if (!aba) return NextResponse.json({ erro: "planilha_sem_abas" }, { status: 422 });

    const planilha = workbook.Sheets[aba];
    const grade = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(planilha, {
      header: 1,
      defval: null,
      raw: false,
      blankrows: false,
    });
    const alcance = planilha["!ref"] ? XLSX.utils.decode_range(planilha["!ref"]) : null;
    const totalLinhas = alcance ? alcance.e.r + 1 : grade.length;
    const totalColunas = alcance ? alcance.e.c + 1 : Math.max(0, ...grade.map((linha) => linha.length));
    const linhas = grade.slice(0, LIMITE_LINHAS).map((linha) => linha.slice(0, LIMITE_COLUNAS));

    return NextResponse.json({
      arquivo_nome: importacao.arquivo_nome,
      arquivo_tamanho: importacao.arquivo_tamanho,
      abas: workbook.SheetNames,
      aba,
      linhas,
      total_linhas: totalLinhas,
      total_colunas: totalColunas,
      truncado: totalLinhas > LIMITE_LINHAS || totalColunas > LIMITE_COLUNAS,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ erro: "nao_foi_possivel_ler_planilha" }, { status: 422 });
  }
}
