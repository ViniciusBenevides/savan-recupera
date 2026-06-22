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
    admin.from("chips").select("nome, maturidade, aquecimento_perfil, limite_dia_override, papel, agente_nome, tipo").eq("id", Number(id)).maybeSingle(),
    admin.from("chips_credenciais").select("zapi_instance_id, zapi_token, zapi_client_token").eq("chip_id", Number(id)).maybeSingle(),
  ]);
  if (!chip) return NextResponse.json({ erro: "chip_nao_encontrado" }, { status: 404 });

  return NextResponse.json({
    nome: chip.nome,
    maturidade: chip.maturidade ?? "novo",
    aquecimento_perfil: chip.aquecimento_perfil ?? null,
    limite_dia_override: chip.limite_dia_override ?? null,
    papel: chip.papel ?? "bot",
    agente_nome: chip.agente_nome ?? "",
    tipo: chip.tipo ?? "fisico",
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

  const { nome, instance_id, token, client_token, maturidade, aquecimento_perfil, limite_dia_override, papel, agente_nome, tipo } = await req.json();
  const admin = supabaseAdmin();

  const chipPatch: Record<string, unknown> = {};
  if (typeof nome === "string" && nome.trim()) chipPatch.nome = nome.trim();
  if (["fisico", "esim", "voip", "virtual_api"].includes(tipo)) chipPatch.tipo = tipo;
  if (papel === "bot" || papel === "equipe") chipPatch.papel = papel;
  if (agente_nome !== undefined) chipPatch.agente_nome = (typeof agente_nome === "string" && agente_nome.trim()) ? agente_nome.trim() : null;
  if (maturidade === "aquecido" || maturidade === "novo") chipPatch.maturidade = maturidade;
  if (aquecimento_perfil !== undefined) chipPatch.aquecimento_perfil = aquecimento_perfil || null;
  if (limite_dia_override !== undefined) {
    chipPatch.limite_dia_override = limite_dia_override === null || limite_dia_override === "" ? null : Number(limite_dia_override);
  }
  if (Object.keys(chipPatch).length > 0) {
    const { error } = await admin.from("chips").update(chipPatch).eq("id", Number(id));
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
