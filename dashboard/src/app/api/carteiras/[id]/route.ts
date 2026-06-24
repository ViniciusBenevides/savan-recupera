import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarCarteira, erroDono } from "@/lib/auth";

const STATUS_VALIDOS = ["importando", "ativa", "pausada", "arquivada"];
// campos que o painel pode atualizar (credor_id liga o usuário-credor dono da carteira)
const CAMPOS = ["nome", "credor", "credor_id", "descricao", "status", "prompt_persona", "contexto_negocio", "guardrails", "config_override"];

// PATCH: atualiza status / overrides de prompt e config da carteira (admin ou cobrador dono)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarCarteira(g.sessao, Number(id)))) return erroDono();

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

// DELETE: apaga a carteira e tudo dela (cascade). admin ou cobrador dono.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarCarteira(g.sessao, Number(id)))) return erroDono();

  const admin = supabaseAdmin();
  const { error } = await admin.from("carteiras").delete().eq("id", Number(id));
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
