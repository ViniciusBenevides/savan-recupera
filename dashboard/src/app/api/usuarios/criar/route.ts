import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

// Cria um novo usuário do painel (apenas admin). E-mail já confirmado, com papel definido.
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user.id).maybeSingle();
  if (perfil?.role !== "admin") return NextResponse.json({ erro: "Apenas administradores podem criar usuários." }, { status: 403 });

  const { nome, email, senha, role } = await req.json();
  const emailLimpo = (email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
    return NextResponse.json({ erro: "E-mail inválido." }, { status: 400 });
  }
  if (!senha || senha.length < 8) {
    return NextResponse.json({ erro: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
  }
  const papel = ["admin", "operador", "visualizador"].includes(role) ? role : "visualizador";

  const admin = supabaseAdmin();
  const { data: novo, error } = await admin.auth.admin.createUser({
    email: emailLimpo,
    password: senha,
    email_confirm: true,
    user_metadata: { nome: nome?.trim() || emailLimpo.split("@")[0] },
  });
  if (error) {
    const dup = /already|registered|exists/i.test(error.message);
    return NextResponse.json(
      { erro: dup ? "Já existe um usuário com esse e-mail." : error.message },
      { status: 400 },
    );
  }

  // o trigger cria a linha em usuarios_app como visualizador; ajusta o papel e o nome
  if (novo?.user?.id) {
    await admin.from("usuarios_app").upsert({
      id: novo.user.id,
      email: emailLimpo,
      nome: nome?.trim() || emailLimpo.split("@")[0],
      role: papel,
    }, { onConflict: "id" });
  }

  return NextResponse.json({ ok: true });
}
