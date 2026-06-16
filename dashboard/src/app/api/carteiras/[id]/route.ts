import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

const STATUS_VALIDOS = ["importando", "ativa", "pausada", "arquivada"];
// campos que o painel pode atualizar
const CAMPOS = ["nome", "credor", "descricao", "status", "prompt_persona", "contexto_negocio", "guardrails", "config_override"];

async function perfil() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { user: null, role: null };
  const { data } = await sb.from("usuarios_app").select("role").eq("id", user.id).maybeSingle();
  return { user, role: data?.role ?? null };
}

// PATCH: atualiza status / overrides de prompt e config da carteira (admin/operador)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, role } = await perfil();
  if (!user) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  if (!["admin", "operador"].includes(role!)) return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });

  const b = await req.json();
  const patch: Record<string, unknown> = {};
  for (const c of CAMPOS) if (c in b) patch[c] = b[c];
  if ("status" in patch && !STATUS_VALIDOS.includes(String(patch.status))) {
    return NextResponse.json({ erro: "status_invalido" }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ erro: "nada_para_atualizar" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("carteiras").update(patch).eq("id", Number(id));
  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json({ erro: dup ? "Já existe uma carteira com esse nome." : error.message }, { status: dup ? 409 : 400 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE: apaga a carteira e tudo dela (cascade). Só admin.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, role } = await perfil();
  if (!user) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  if (role !== "admin") return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("carteiras").delete().eq("id", Number(id));
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
