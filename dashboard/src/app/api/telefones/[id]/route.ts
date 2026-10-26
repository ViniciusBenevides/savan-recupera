import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirOperador, carteiraDoDevedorSePodeOperar } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

/**
 * DELETE — exclui um telefone da operação (o "Excluir" da Central do cliente da V5.5.11).
 * body: { motivo?: string }
 * O número sai de tudo (robô, fila, lista de contatos) e o registro fica para o histórico das
 * conversas. Se a abordagem ainda não tinha saído por ele e houver outro celular, a pessoa volta
 * para a fila com o outro número.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirOperador();
  if (g.erro) return g.erro;
  const { sessao } = g;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: "Telefone inválido." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const motivo = b?.motivo ? String(b.motivo).trim().slice(0, 300) : null;

  const adm = supabaseAdmin();
  const { data: tel } = await adm.from("telefones_devedor").select("id, devedor_id, excluido_em").eq("id", id).maybeSingle();
  if (!tel) return NextResponse.json({ erro: "Telefone não encontrado." }, { status: 404 });
  if (tel.excluido_em) return NextResponse.json({ erro: "Este telefone já foi excluído." }, { status: 409 });
  const cart = await carteiraDoDevedorSePodeOperar(sessao, tel.devedor_id);
  if (!cart) return NextResponse.json({ erro: "Você não pode trabalhar este devedor." }, { status: 403 });

  const { data, error } = await adm.rpc("fn_excluir_telefone", { p_telefone_id: id, p_autor: sessao.user.id, p_autor_nome: sessao.nome, p_motivo: motivo });
  if (error) return NextResponse.json({ erro: error.message.includes("ja_excluido") ? "Este telefone já foi excluído." : "Não foi possível excluir o telefone." }, { status: 400 });

  await registrarAuditoria(adm, sessao, {
    acao: "telefone_excluido", entidade: "telefone", entidade_id: id, carteira_id: cart.carteira_id, devedor_id: tel.devedor_id,
    detalhe: { ...(data as Record<string, unknown>), motivo },
  });
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
