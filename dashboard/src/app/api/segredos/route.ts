import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

async function exigirAdmin() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { erro: "nao_autenticado", status: 401 };
  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user.id).maybeSingle();
  if (perfil?.role !== "admin") return { erro: "sem_permissao", status: 403 };
  return { user };
}

// GET: lista os segredos com o valor já salvo (rota admin-only; o painel exibe
// mascarado e só revela ao clicar no olho). Cada instância/conta lê os seus próprios
// segredos do seu próprio banco — não há mistura entre contas.
export async function GET() {
  const guard = await exigirAdmin();
  if ("erro" in guard) return NextResponse.json({ erro: guard.erro }, { status: guard.status });
  const admin = supabaseAdmin();
  const { data } = await admin.from("segredos").select("chave, valor, descricao").order("chave");
  const segredos = (data ?? []).map((s) => ({
    chave: s.chave, descricao: s.descricao,
    preenchido: !!s.valor && s.valor.length > 0,
    valor: s.valor ?? "",
  }));
  return NextResponse.json({ segredos });
}

// POST: atualiza um segredo.
export async function POST(req: Request) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return NextResponse.json({ erro: guard.erro }, { status: guard.status });
  const { chave, valor } = await req.json();
  const admin = supabaseAdmin();
  const { error } = await admin.from("segredos")
    .upsert({ chave, valor, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
