import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarChip, erroDono } from "@/lib/auth";

// POST { acao: "aplicar" | "ignorar", chip_destino_id? }
// aplicar → reatribui a fila/conversas do chip caído para o destino (ou pool se null) e
// marca o evento como aplicado. ignorar → descarta o alerta.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const { sessao } = g;

  const { acao, chip_destino_id } = await req.json();
  const admin = supabaseAdmin();

  const { data: ev } = await admin.from("failover_eventos").select("id, chip_caido_id, status").eq("id", Number(id)).maybeSingle();
  if (!ev) return NextResponse.json({ erro: "evento_nao_encontrado" }, { status: 404 });
  if (ev.status !== "pendente") return NextResponse.json({ erro: "evento_ja_resolvido" }, { status: 409 });
  // o evento é de um chip caído; o cobrador só resolve failover dos seus chips
  if (ev.chip_caido_id != null && !(await podeEditarChip(sessao, ev.chip_caido_id))) return erroDono();
  if (ev.chip_caido_id == null && sessao.role !== "admin") return erroDono();
  const user = sessao.user;

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
