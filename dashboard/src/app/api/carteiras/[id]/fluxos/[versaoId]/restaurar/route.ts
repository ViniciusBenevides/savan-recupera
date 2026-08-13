import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarCarteira, erroDono } from "@/lib/auth";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; versaoId: string }> },
) {
  const { id, versaoId } = await params;
  const carteiraId = Number(id);
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarCarteira(g.sessao, carteiraId))) return erroDono();

  const admin = supabaseAdmin();
  const { data: origem } = await admin.from("fluxo_versoes").select("*")
    .eq("id", Number(versaoId)).eq("carteira_id", carteiraId).maybeSingle();
  if (!origem) return NextResponse.json({ erro: "versao_nao_encontrada" }, { status: 404 });
  const { data: ultima } = await admin.from("fluxo_versoes").select("versao")
    .eq("carteira_id", carteiraId).order("versao", { ascending: false }).limit(1).maybeSingle();
  const novaNumero = Number(ultima?.versao ?? 0) + 1;
  const { data: nova, error: erroNova } = await admin.from("fluxo_versoes").insert({
    carteira_id: carteiraId,
    versao: novaNumero,
    nome: `Versão ${novaNumero} · restaurada da v${origem.versao}`,
    roteiro: origem.roteiro,
    meta_abordagem_template: origem.meta_abordagem_template,
    meta_abordagem_template_candidato: origem.meta_abordagem_template_candidato,
    origem_versao_id: origem.id,
    criado_por: g.sessao.user.id,
  }).select("id").single();
  if (erroNova) return NextResponse.json({ erro: erroNova.message }, { status: 400 });

  const { error } = await admin.from("carteiras").update({
    roteiro: origem.roteiro,
    fluxo_versao_ativa_id: nova.id,
  }).eq("id", carteiraId);
  if (error) {
    await admin.from("fluxo_versoes").delete().eq("id", nova.id);
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, fluxo_versao_id: nova.id, versao: novaNumero });
}
