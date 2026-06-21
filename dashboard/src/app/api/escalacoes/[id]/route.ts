import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

// status que o operador pode definir manualmente (fechada_paga é automática via pagamento)
const STATUS_MANUAIS = ["aberta", "em_atendimento", "fechada_acordo", "fechada_sem_acordo"];

async function perfil() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { user: null, role: null, nome: null };
  const { data } = await sb.from("usuarios_app").select("role, nome").eq("id", user.id).maybeSingle();
  return { user, role: data?.role ?? null, nome: data?.nome ?? null };
}

// PATCH: atualiza o desfecho de uma escalação (quem assumiu, status, acordo, observação).
// É o registro de transparência: todo caso escalado termina com um status rastreável.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, role, nome } = await perfil();
  if (!user) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  if (!["admin", "operador"].includes(role!)) return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });

  const b = await req.json();
  const patch: Record<string, unknown> = {};

  if ("status" in b) {
    if (!STATUS_MANUAIS.includes(String(b.status))) return NextResponse.json({ erro: "status_invalido" }, { status: 400 });
    patch.status = b.status;
    patch.fechado_em = String(b.status).startsWith("fechada") ? new Date().toISOString() : null;
    // ao assumir/fechar, registra quem foi (se ainda não houver)
    if (!("assumido_por" in b)) patch.assumido_por = nome ?? user.email ?? "operador";
  }
  if ("assumido_por" in b) patch.assumido_por = b.assumido_por;
  if ("valor_combinado" in b) patch.valor_combinado = b.valor_combinado === "" || b.valor_combinado == null ? null : Number(b.valor_combinado);
  if ("observacao" in b) patch.observacao = b.observacao;

  if (Object.keys(patch).length === 0) return NextResponse.json({ erro: "nada_para_atualizar" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("escalacoes").update(patch).eq("id", Number(id));
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
