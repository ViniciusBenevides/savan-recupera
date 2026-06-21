import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

async function perfil() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { user: null, role: null };
  const { data } = await sb.from("usuarios_app").select("role").eq("id", user.id).maybeSingle();
  return { user, role: data?.role ?? null };
}

// POST { acao: "aplicar" | "ignorar", chip_destino_id? }
// aplicar → reatribui a fila/conversas do chip caído para o destino (ou pool se null) e
// marca o evento como aplicado. ignorar → descarta o alerta.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, role } = await perfil();
  if (!user) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  if (!["admin", "operador"].includes(role!)) return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });

  const { acao, chip_destino_id } = await req.json();
  const admin = supabaseAdmin();

  const { data: ev } = await admin.from("failover_eventos").select("id, chip_caido_id, status").eq("id", Number(id)).maybeSingle();
  if (!ev) return NextResponse.json({ erro: "evento_nao_encontrado" }, { status: 404 });
  if (ev.status !== "pendente") return NextResponse.json({ erro: "evento_ja_resolvido" }, { status: 409 });

  if (acao === "ignorar") {
    await admin.from("failover_eventos").update({ status: "ignorado", aplicado_em: new Date().toISOString(), aplicado_por: user.id }).eq("id", ev.id);
    return NextResponse.json({ ok: true });
  }

  if (acao === "aplicar") {
    const destino = chip_destino_id == null || chip_destino_id === "" ? null : Number(chip_destino_id);
    const { data: resumo, error } = await admin.rpc("fn_reatribuir_chip", {
      p_chip_caido: ev.chip_caido_id, p_chip_destino: destino,
    });
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    await admin.from("failover_eventos").update({
      status: "aplicado", chip_destino_id: destino,
      aplicado_em: new Date().toISOString(), aplicado_por: user.id,
    }).eq("id", ev.id);
    return NextResponse.json({ ok: true, resumo });
  }

  return NextResponse.json({ erro: "acao_invalida" }, { status: 400 });
}
