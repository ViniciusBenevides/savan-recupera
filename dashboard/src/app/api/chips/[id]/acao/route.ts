import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

// Ativa (inicia aquecimento), pausa ou retoma um chip.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user.id).maybeSingle();
  if (!perfil || !["admin", "operador"].includes(perfil.role)) {
    return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });
  }

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
