import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";

// Altera a role (e, p/ admin, o tenant) de um usuário. Ninguém vira admin (admin único).
export async function POST(req: Request) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const { sessao } = g;

  const { id, role, cobrador_id } = await req.json();
  if (role === "admin") {
    return NextResponse.json({ erro: "Não é possível promover a administrador." }, { status: 400 });
  }
  if (!["cobrador", "credor", "visualizador"].includes(role)) {
    return NextResponse.json({ erro: "role_invalida" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: alvo } = await admin.from("usuarios_app").select("role, cobrador_id").eq("id", id).maybeSingle();
  if (!alvo) return NextResponse.json({ erro: "usuario_nao_encontrado" }, { status: 404 });

  if (sessao.role === "cobrador") {
    // cobrador só mexe nos usuários do próprio tenant e não cria outro cobrador
    if (alvo.cobrador_id !== sessao.user.id) return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });
    if (role === "cobrador") return NextResponse.json({ erro: "Você não pode promover alguém a cobrador." }, { status: 400 });
  } else {
    // admin: não altera o próprio papel; não rebaixa o admin da plataforma
    if (id === sessao.user.id) return NextResponse.json({ erro: "Você não pode alterar o próprio papel." }, { status: 400 });
    if (alvo.role === "admin") return NextResponse.json({ erro: "Não é possível rebaixar o administrador da plataforma." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { role };
  // admin pode (re)definir o tenant de um credor/visualizador
  if (sessao.role === "admin" && (role === "credor" || role === "visualizador") && typeof cobrador_id === "string") {
    patch.cobrador_id = cobrador_id || null;
  }
  // cobrador vira self-tenant nulo; credor/visualizador no tenant do cobrador atual (se trocou de papel)
  if (role === "cobrador") patch.cobrador_id = null;

  const { error } = await admin.from("usuarios_app").update(patch).eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
