import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirOperador, carteiraDoDevedorSePodeOperar } from "@/lib/auth";

/**
 * PATCH — responsável pelo devedor ("Assumir" do MC COB). body: { responsavel_id: "eu" | uuid | null }
 * O negociador só assume para si ou solta; o dono da operação (e o admin) distribui para quem é
 * da equipe dele.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirOperador();
  if (g.erro) return g.erro;
  const { sessao } = g;
  const id = Number((await params).id);
  const b = await req.json().catch(() => ({}));
  const cart = await carteiraDoDevedorSePodeOperar(sessao, id);
  if (!cart) return NextResponse.json({ erro: "Você não pode trabalhar este devedor." }, { status: 403 });

  let alvo: string | null = b?.responsavel_id === "eu" ? sessao.user.id : (b?.responsavel_id ?? null);
  if (alvo && alvo !== sessao.user.id) {
    if (sessao.role === "negociador") return NextResponse.json({ erro: "Você só pode assumir para si." }, { status: 403 });
    const { data: u } = await supabaseAdmin().from("usuarios_app").select("id, role, cobrador_id").eq("id", alvo).maybeSingle();
    const daEquipe = !!u && ((u.role === "cobrador" && u.id === cart.cobrador_id) || (u.role === "negociador" && u.cobrador_id === cart.cobrador_id));
    if (!daEquipe) return NextResponse.json({ erro: "Essa pessoa não é da equipe desta carteira." }, { status: 400 });
  }
  if (alvo === undefined) alvo = null;

  const { error } = await supabaseAdmin().from("devedores").update({ responsavel_id: alvo }).eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, responsavel_id: alvo });
}
