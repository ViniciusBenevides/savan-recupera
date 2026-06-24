import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarChip, erroDono } from "@/lib/auth";

// Ativa (inicia aquecimento), pausa ou retoma um chip.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarChip(g.sessao, Number(id)))) return erroDono();

  const { acao } = await req.json(); // 'ativar' | 'pausar' | 'retomar'
  const admin = supabaseAdmin();
  const patch: any = {};

  if (acao === "ativar") {
    // inicia o aquecimento a partir de hoje
    const { data: chip } = await admin.from("chips").select("data_ativacao").eq("id", Number(id)).single();
    patch.status = "aquecendo";
    if (!chip?.data_ativacao) patch.data_ativacao = new Date().toISOString().slice(0, 10);
  } else if (acao === "pausar") {
    patch.status = "pausado";
  } else if (acao === "retomar") {
    patch.status = "aquecendo";
  } else {
    return NextResponse.json({ erro: "acao_invalida" }, { status: 400 });
  }

  const { error } = await admin.from("chips").update(patch).eq("id", Number(id));
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
