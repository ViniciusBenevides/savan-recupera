import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";
import { vincularChatwootInbox } from "@/lib/chatwoot";

// Cria chip + credenciais Z-API + (best-effort) inbox no Chatwoot.
export async function POST(req: Request) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const { sessao } = g;

  const { nome, instance_id, token, client_token, maturidade, aquecimento_perfil, limite_dia_override, papel, agente_nome, tipo, cobrador_id } = await req.json();
  if (!nome || !instance_id || !token || !client_token) {
    return NextResponse.json({ erro: "campos_obrigatorios" }, { status: 400 });
  }
  const admin = supabaseAdmin();

  // dono do chip: cobrador => ele mesmo; admin => o cobrador alvo informado, senão ele mesmo
  const dono = sessao.role === "cobrador"
    ? sessao.user.id
    : (typeof cobrador_id === "string" && cobrador_id ? cobrador_id : sessao.user.id);
  const novo: Record<string, unknown> = { nome, status: "cadastrado", cobrador_id: dono };
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
