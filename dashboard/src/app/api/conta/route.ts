import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

// Atualiza o próprio perfil: nome de exibição e/ou e-mail de login.
// A troca de e-mail é instantânea (via service role), sem link de confirmação.
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });

  const { nome, email } = await req.json();
  const admin = supabaseAdmin();

  if (typeof email === "string" && email.trim() && email.trim().toLowerCase() !== user.email) {
    const novoEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novoEmail)) {
      return NextResponse.json({ erro: "E-mail inválido." }, { status: 400 });
    }
    const { error: e1 } = await admin.auth.admin.updateUserById(user.id, {
      email: novoEmail,
      email_confirm: true,
    });
    if (e1) {
      const dup = /already|registered|exists/i.test(e1.message);
      return NextResponse.json(
        { erro: dup ? "Esse e-mail já está em uso por outra conta." : e1.message },
        { status: 400 },
      );
    }
    await admin.from("usuarios_app").update({ email: novoEmail }).eq("id", user.id);
  }

  if (typeof nome === "string" && nome.trim()) {
    const { error: e2 } = await admin.from("usuarios_app").update({ nome: nome.trim() }).eq("id", user.id);
    if (e2) return NextResponse.json({ erro: e2.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
