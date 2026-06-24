import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";

// GET: lista as carteiras (o RLS já escopa por papel: admin tudo, cobrador as suas,
// credor as que é dono, visualizador as do seu cobrador).
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  const { data, error } = await sb.from("carteiras")
    .select("id, nome, credor, status, num_devedores, soma_saldo, criado_em, cobrador_id, credor_id")
    .order("criado_em", { ascending: false });
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ carteiras: data ?? [] });
}

// POST: cria uma carteira (entra como "importando" até o upload concluir). admin ou cobrador.
export async function POST(req: Request) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const { sessao } = g;

  const b = await req.json();
  const nome = String(b.nome ?? "").trim();
  if (!nome) return NextResponse.json({ erro: "nome_obrigatorio" }, { status: 400 });

  // dono (cobrador) da carteira: o cobrador é sempre ele mesmo; o admin pode designar
  // um cobrador alvo (b.cobrador_id) ou ficar como dono ele mesmo.
  const cobrador_id = sessao.role === "cobrador"
    ? sessao.user.id
    : (typeof b.cobrador_id === "string" && b.cobrador_id ? b.cobrador_id : sessao.user.id);
  const credor_id = typeof b.credor_id === "string" && b.credor_id ? b.credor_id : null;

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("carteiras").insert({
    nome,
    credor: b.credor ? String(b.credor).trim() : null,
    descricao: b.descricao ? String(b.descricao).trim() : null,
    status: "importando",
    criado_por: sessao.user.id,
    cobrador_id,
    credor_id,
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
