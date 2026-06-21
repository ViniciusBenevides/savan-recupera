import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { deletarInbox } from "@/lib/chatwoot";

async function exigirOperador() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { erro: "nao_autenticado", status: 401 };
  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user.id).maybeSingle();
  if (!perfil || !["admin", "operador"].includes(perfil.role)) return { erro: "sem_permissao", status: 403 };
  return { user };
}

// Devolve os dados do chip + credenciais Z-API para preencher o formulário de
// edição (só admin/operador). Os tokens chegam ao navegador apenas aqui, sob auth.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await exigirOperador();
  if ("erro" in guard) return NextResponse.json({ erro: guard.erro }, { status: guard.status });

  const admin = supabaseAdmin();
  const [{ data: chip }, { data: cred }] = await Promise.all([
    admin.from("chips").select("nome").eq("id", Number(id)).maybeSingle(),
    admin.from("chips_credenciais").select("zapi_instance_id, zapi_token, zapi_client_token").eq("chip_id", Number(id)).maybeSingle(),
  ]);
  if (!chip) return NextResponse.json({ erro: "chip_nao_encontrado" }, { status: 404 });

  return NextResponse.json({
    nome: chip.nome,
    instance_id: cred?.zapi_instance_id ?? "",
    token: cred?.zapi_token ?? "",
    client_token: cred?.zapi_client_token ?? "",
  });
}

// Edita nome e/ou credenciais Z-API do chip.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await exigirOperador();
  if ("erro" in guard) return NextResponse.json({ erro: guard.erro }, { status: guard.status });

  const { nome, instance_id, token, client_token } = await req.json();
  const admin = supabaseAdmin();

  if (typeof nome === "string" && nome.trim()) {
    const { error } = await admin.from("chips").update({ nome: nome.trim() }).eq("id", Number(id));
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  }

  const patch: Record<string, string> = {};
  if (typeof instance_id === "string" && instance_id.trim()) patch.zapi_instance_id = instance_id.trim();
  if (typeof token === "string" && token.trim()) patch.zapi_token = token.trim();
  if (typeof client_token === "string" && client_token.trim()) patch.zapi_client_token = client_token.trim();
  if (Object.keys(patch).length > 0) {
    const { error } = await admin.from("chips_credenciais").update(patch).eq("chip_id", Number(id));
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

// Exclui o chip (cascade nas credenciais/métricas; fila/conversas viram null) e
// remove o inbox vinculado no Chatwoot (best-effort).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await exigirOperador();
  if ("erro" in guard) return NextResponse.json({ erro: guard.erro }, { status: guard.status });

  const admin = supabaseAdmin();
  const { data: chip } = await admin.from("chips").select("chatwoot_inbox_id").eq("id", Number(id)).maybeSingle();
  if (!chip) return NextResponse.json({ erro: "chip_nao_encontrado" }, { status: 404 });

  if (chip.chatwoot_inbox_id) await deletarInbox(chip.chatwoot_inbox_id);

  const { error } = await admin.from("chips").delete().eq("id", Number(id));
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
