import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirAdmin } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

/**
 * POST — inativa o cliente (Zona de risco da Ficha, V5.7.01). Só o administrador.
 * body: { confirmacao: "INATIVAR" }
 * Sai da operação (fila do robô, agenda, conversa do robô) e das listas; o histórico fica.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if (g.erro) return g.erro;
  const id = Number((await params).id);
  const b = await req.json().catch(() => ({}));
  if (String(b?.confirmacao ?? "").trim().toUpperCase() !== "INATIVAR") {
    return NextResponse.json({ erro: "Para inativar, digite INATIVAR." }, { status: 400 });
  }

  const adm = supabaseAdmin();
  const { data: d } = await adm.from("devedores").select("id, nome, cpf_cnpj, processo, carteira_id").eq("id", id).maybeSingle();
  if (!d) return NextResponse.json({ erro: "Devedor não encontrado." }, { status: 404 });

  const { data, error } = await adm.rpc("fn_inativar_devedor", { p_devedor_id: id, p_autor: g.sessao.user.id, p_autor_nome: g.sessao.nome });
  if (error) return NextResponse.json({ erro: error.message.includes("ja_inativo") ? "Este cliente já está inativo." : "Não foi possível inativar." }, { status: 400 });

  await registrarAuditoria(adm, g.sessao, {
    acao: "devedor_inativado", entidade: "devedor", entidade_id: id, carteira_id: d.carteira_id, devedor_id: id,
    detalhe: { nome: d.nome, documento: d.cpf_cnpj, processo: d.processo, ...(data as Record<string, unknown>) },
  });
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
