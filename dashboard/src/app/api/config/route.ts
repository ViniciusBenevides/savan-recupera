import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

// Atualiza chaves de `configuracoes`. Exige admin/operador.
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });

  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user.id).maybeSingle();
  if (!perfil || !["admin", "operador"].includes(perfil.role)) {
    return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });
  }

  const body = await req.json(); // { chave, valor }  ou  { itens: [{chave,valor}] }
  const itens = body.itens ?? [{ chave: body.chave, valor: body.valor }];
  const admin = supabaseAdmin();
  for (const it of itens) {
    const { error } = await admin
      .from("configuracoes")
      .update({ valor: it.valor, atualizado_por: user.id, atualizado_em: new Date().toISOString() })
      .eq("chave", it.chave);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
