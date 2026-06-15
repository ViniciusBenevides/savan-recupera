import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

// Altera a role de um usuário. Apenas admin.
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user.id).maybeSingle();
  if (perfil?.role !== "admin") return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });

  const { id, role } = await req.json();
  if (!["admin", "operador", "visualizador"].includes(role)) {
    return NextResponse.json({ erro: "role_invalida" }, { status: 400 });
  }
  const admin = supabaseAdmin();

  // trava 1: não pode rebaixar a própria conta de admin (evita auto-bloqueio)
  if (id === user.id && role !== "admin") {
    return NextResponse.json(
      { erro: "Você não pode rebaixar a própria conta. Peça a outro administrador." },
      { status: 400 },
    );
  }
  // trava 2: não pode remover o último admin do sistema
  if (role !== "admin") {
    const { count } = await admin.from("usuarios_app").select("id", { count: "exact", head: true }).eq("role", "admin");
    const { data: alvo } = await admin.from("usuarios_app").select("role").eq("id", id).maybeSingle();
    if (alvo?.role === "admin" && (count ?? 0) <= 1) {
      return NextResponse.json({ erro: "É preciso manter ao menos um administrador." }, { status: 400 });
    }
  }

  const { error } = await admin.from("usuarios_app").update({ role }).eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
