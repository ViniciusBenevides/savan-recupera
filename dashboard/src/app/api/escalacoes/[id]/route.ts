import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarCarteira, erroDono } from "@/lib/auth";

// status que o operador pode definir manualmente (fechada_paga é automática via pagamento)
const STATUS_MANUAIS = ["aberta", "em_atendimento", "fechada_acordo", "fechada_sem_acordo"];

// PATCH: atualiza o desfecho de uma escalação (quem assumiu, status, acordo, observação).
// É o registro de transparência: todo caso escalado termina com um status rastreável.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const { sessao } = g;

  const admin = supabaseAdmin();
  // a escalação pertence a uma carteira; o cobrador só mexe nas escalações das suas carteiras
  const { data: esc } = await admin.from("escalacoes").select("carteira_id").eq("id", Number(id)).maybeSingle();
  if (!esc) return NextResponse.json({ erro: "escalacao_nao_encontrada" }, { status: 404 });
  if (esc.carteira_id == null) {
    if (sessao.role !== "admin") return erroDono();
  } else if (!(await podeEditarCarteira(sessao, esc.carteira_id))) {
    return erroDono();
  }

  const { data: perfil } = await admin.from("usuarios_app").select("nome").eq("id", sessao.user.id).maybeSingle();
  const nome = perfil?.nome ?? null;

  const b = await req.json();
  const patch: Record<string, unknown> = {};

  if ("status" in b) {
    if (!STATUS_MANUAIS.includes(String(b.status))) return NextResponse.json({ erro: "status_invalido" }, { status: 400 });
    patch.status = b.status;
    patch.fechado_em = String(b.status).startsWith("fechada") ? new Date().toISOString() : null;
    // ao assumir/fechar, registra quem foi (se ainda não houver)
    if (!("assumido_por" in b)) patch.assumido_por = nome ?? sessao.user.email ?? "operador";
  }
  if ("assumido_por" in b) patch.assumido_por = b.assumido_por;
  if ("valor_combinado" in b) patch.valor_combinado = b.valor_combinado === "" || b.valor_combinado == null ? null : Number(b.valor_combinado);
  if ("observacao" in b) patch.observacao = b.observacao;

  if (Object.keys(patch).length === 0) return NextResponse.json({ erro: "nada_para_atualizar" }, { status: 400 });

  const { error } = await admin.from("escalacoes").update(patch).eq("id", Number(id));
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
