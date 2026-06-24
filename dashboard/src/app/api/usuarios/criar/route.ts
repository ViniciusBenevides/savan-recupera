import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";

// Quem pode criar quais papéis. NINGUÉM cria admin (admin único = dono da plataforma).
const CRIAVEIS_ADMIN = ["cobrador", "credor", "visualizador"];
const CRIAVEIS_COBRADOR = ["credor", "visualizador"];

// Cria um novo usuário do painel. Admin cria cobrador/credor/visualizador; cobrador cria
// o próprio credor/visualizador (já anexados ao tenant dele). E-mail já confirmado.
export async function POST(req: Request) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const { sessao } = g;

  const { nome, email, senha, role, cobrador_id, carteira_ids } = await req.json();
  const emailLimpo = (email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
    return NextResponse.json({ erro: "E-mail inválido." }, { status: 400 });
  }
  if (!senha || senha.length < 8) {
    return NextResponse.json({ erro: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
  }
  if (role === "admin") {
    return NextResponse.json({ erro: "Não é possível criar outro administrador." }, { status: 400 });
  }
  const permitidos = sessao.role === "admin" ? CRIAVEIS_ADMIN : CRIAVEIS_COBRADOR;
  const papel = permitidos.includes(role) ? role : "visualizador";

  // tenant (cobrador dono): cobrador => sempre ele; admin => o cobrador alvo (p/ credor/visualizador)
  let tenant: string | null = null;
  if (sessao.role === "cobrador") {
    tenant = sessao.user.id;
  } else if (papel === "credor" || papel === "visualizador") {
    tenant = typeof cobrador_id === "string" && cobrador_id ? cobrador_id : null;
  }

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

  if (novo?.user?.id) {
    // o trigger cria como visualizador; ajusta papel, nome, tenant e atribuição
    await admin.from("usuarios_app").upsert({
      id: novo.user.id,
      email: emailLimpo,
      nome: nome?.trim() || emailLimpo.split("@")[0],
      role: papel,
      cobrador_id: tenant,
      criado_por: sessao.user.id,
    }, { onConflict: "id" });

    // credor: liga às carteiras escolhidas (só as que o ator pode editar)
    if (papel === "credor" && Array.isArray(carteira_ids) && carteira_ids.length) {
      let q = admin.from("carteiras").update({ credor_id: novo.user.id }).in("id", carteira_ids.map(Number));
      if (sessao.role === "cobrador") q = q.eq("cobrador_id", sessao.user.id);
      await q;
    }
  }

  return NextResponse.json({ ok: true });
}
