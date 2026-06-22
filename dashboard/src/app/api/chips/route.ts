import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { vincularChatwootInbox } from "@/lib/chatwoot";

async function exigirOperador() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { erro: "nao_autenticado", status: 401 };
  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user.id).maybeSingle();
  if (!perfil || !["admin", "operador"].includes(perfil.role)) return { erro: "sem_permissao", status: 403 };
  return { user };
}

// Cria chip + credenciais Z-API + (best-effort) inbox no Chatwoot.
export async function POST(req: Request) {
  const guard = await exigirOperador();
  if ("erro" in guard) return NextResponse.json({ erro: guard.erro }, { status: guard.status });

  const { nome, instance_id, token, client_token, maturidade, aquecimento_perfil, limite_dia_override, papel, agente_nome, tipo } = await req.json();
  if (!nome || !instance_id || !token || !client_token) {
    return NextResponse.json({ erro: "campos_obrigatorios" }, { status: 400 });
  }
  const admin = supabaseAdmin();

  const novo: Record<string, unknown> = { nome, status: "cadastrado" };
  if (["fisico", "esim", "voip", "virtual_api"].includes(tipo)) novo.tipo = tipo;
  if (papel === "bot" || papel === "equipe") novo.papel = papel;
  if (typeof agente_nome === "string" && agente_nome.trim()) novo.agente_nome = agente_nome.trim();
  if (maturidade === "aquecido" || maturidade === "novo") novo.maturidade = maturidade;
  if (typeof aquecimento_perfil === "string" && aquecimento_perfil.trim()) novo.aquecimento_perfil = aquecimento_perfil.trim();
  if (limite_dia_override != null && limite_dia_override !== "") novo.limite_dia_override = Number(limite_dia_override);

  const { data: chip, error } = await admin
    .from("chips")
    .insert(novo)
    .select("id")
    .single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  await admin.from("chips_credenciais").insert({
    chip_id: chip.id, zapi_instance_id: instance_id, zapi_token: token, zapi_client_token: client_token,
  });

  // cria o inbox no Chatwoot (canal Z-API) já vinculando o token de segurança.
  // O resultado vai no retorno para o front avisar se ficou ou não linkado.
  const cw = await vincularChatwootInbox({ chipId: chip.id, nome, instanceId: instance_id, token, clientToken: client_token });

  return NextResponse.json({
    ok: true,
    chip_id: chip.id,
    inbox_id: cw.ok ? cw.inbox_id : null,
    chatwoot: cw.ok ? { ok: true } : { ok: false, motivo: cw.motivo, mensagem: cw.mensagem },
  });
}
