import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirOperador } from "@/lib/auth";

/**
 * POST — distribui devedores para alguém da equipe (ou tira o responsável).
 * body: { ids: number[], responsavel_id: uuid | null }
 * O negociador só pode pegar para si ou soltar; o dono da operação distribui para a equipe dele.
 */
export async function POST(req: Request) {
  const g = await exigirOperador();
  if (g.erro) return g.erro;
  const { sessao } = g;
  const b = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(b?.ids) ? [...new Set<number>(b.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))] : [];
  if (!ids.length) return NextResponse.json({ erro: "Escolha pelo menos um devedor." }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ erro: "No máximo 500 por vez." }, { status: 400 });
  const alvo: string | null = b?.responsavel_id ?? null;

  const adm = supabaseAdmin();
  const { data: devs } = await adm.from("devedores").select("id, carteira_id, carteiras(cobrador_id)").in("id", ids);
  const donos = new Set((devs ?? []).map((d) => (d.carteiras as unknown as { cobrador_id: string | null } | null)?.cobrador_id ?? null));
  if ((devs?.length ?? 0) !== ids.length) return NextResponse.json({ erro: "Algum devedor não foi encontrado." }, { status: 404 });
  if (sessao.role !== "admin" && [...donos].some((d) => !d || d !== sessao.tenant)) {
    return NextResponse.json({ erro: "Algum devedor não é das suas carteiras." }, { status: 403 });
  }
  if (alvo && alvo !== sessao.user.id) {
    if (sessao.role === "negociador") return NextResponse.json({ erro: "Você só pode assumir para si." }, { status: 403 });
    const { data: u } = await adm.from("usuarios_app").select("id, role, cobrador_id").eq("id", alvo).maybeSingle();
    const ok = !!u && [...donos].every((dono) => (u.role === "cobrador" && u.id === dono) || (u.role === "negociador" && u.cobrador_id === dono));
    if (!ok) return NextResponse.json({ erro: "Essa pessoa não é da equipe destas carteiras." }, { status: 400 });
  }

  const { error } = await adm.from("devedores").update({ responsavel_id: alvo }).in("id", ids);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, atualizados: ids.length });
}
