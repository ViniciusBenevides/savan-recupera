import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";
import { SEGREDOS_POR_COBRADOR } from "@/lib/segredos";

// GET: lista os segredos do escopo do usuário.
//  - admin    → as chaves GLOBAIS / de infra (cobrador_id NULL).
//  - cobrador → as chaves que ele pode ter as suas (cai no global se vazias).
// O painel mostra mascarado e só revela ao clicar no olho.
export async function GET() {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const { sessao } = g;
  const admin = supabaseAdmin();
  const dono = sessao.role === "cobrador" ? sessao.user.id : null;

  if (dono) {
    // descrições vêm das chaves globais (servem de dica); valor é o do cobrador
    const [{ data: globais }, { data: meus }] = await Promise.all([
      admin.from("segredos").select("chave, descricao").is("cobrador_id", null),
      admin.from("segredos").select("chave, valor").eq("cobrador_id", dono),
    ]);
    const descMap = new Map((globais ?? []).map((s) => [s.chave, s.descricao]));
    const meuMap = new Map((meus ?? []).map((s) => [s.chave, s.valor]));
    const segredos = SEGREDOS_POR_COBRADOR.map((chave) => {
      const v = (meuMap.get(chave) ?? "") as string;
      return { chave, descricao: descMap.get(chave) ?? null, preenchido: !!v && v.length > 0, valor: v };
    });
    return NextResponse.json({ segredos, escopo: "cobrador" });
  }

  const { data } = await admin.from("segredos").select("chave, valor, descricao").is("cobrador_id", null).order("chave");
  const segredos = (data ?? []).map((s) => ({
    chave: s.chave, descricao: s.descricao,
    preenchido: !!s.valor && s.valor.length > 0, valor: s.valor ?? "",
  }));
  return NextResponse.json({ segredos, escopo: "admin" });
}

// POST: atualiza um segredo no escopo do usuário (admin = global; cobrador = o seu).
export async function POST(req: Request) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const dono = g.sessao.role === "cobrador" ? g.sessao.user.id : null;
  const { chave, valor } = await req.json();
  if (dono && !SEGREDOS_POR_COBRADOR.includes(chave)) {
    return NextResponse.json({ erro: "chave_invalida" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  // existe linha nesse escopo? (índices únicos parciais: 1 global + 1 por cobrador)
  let sel = admin.from("segredos").select("chave").eq("chave", chave);
  sel = dono ? sel.eq("cobrador_id", dono) : sel.is("cobrador_id", null);
  const { data: existe } = await sel.maybeSingle();

  if (existe) {
    let upd = admin.from("segredos").update({ valor, atualizado_em: new Date().toISOString() }).eq("chave", chave);
    upd = dono ? upd.eq("cobrador_id", dono) : upd.is("cobrador_id", null);
    const { error } = await upd;
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  } else {
    const { error } = await admin.from("segredos")
      .insert({ chave, valor, cobrador_id: dono, atualizado_em: new Date().toISOString() });
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
