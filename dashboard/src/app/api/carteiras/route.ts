import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

async function exigirPapel(roles: string[]) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { erro: NextResponse.json({ erro: "nao_autenticado" }, { status: 401 }) };
  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user.id).maybeSingle();
  if (!perfil || !roles.includes(perfil.role)) {
    return { erro: NextResponse.json({ erro: "sem_permissao" }, { status: 403 }) };
  }
  return { user };
}

// GET: lista as carteiras
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  const { data, error } = await sb.from("carteiras")
    .select("id, nome, credor, status, num_devedores, soma_saldo, criado_em")
    .order("criado_em", { ascending: false });
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ carteiras: data ?? [] });
}

// POST: cria uma carteira (entra como "importando" até o upload concluir)
export async function POST(req: Request) {
  const auth = await exigirPapel(["admin", "operador"]);
  if (auth.erro) return auth.erro;

  const b = await req.json();
  const nome = String(b.nome ?? "").trim();
  if (!nome) return NextResponse.json({ erro: "nome_obrigatorio" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("carteiras").insert({
    nome,
    credor: b.credor ? String(b.credor).trim() : null,
    descricao: b.descricao ? String(b.descricao).trim() : null,
    status: "importando",
    criado_por: auth.user!.id,
  }).select("id, nome, credor, status").single();

  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json(
      { erro: dup ? "Já existe uma carteira com esse nome." : error.message },
      { status: dup ? 409 : 400 },
    );
  }
  return NextResponse.json({ ok: true, carteira: data });
}
