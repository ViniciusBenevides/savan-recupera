import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirAdmin } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

/**
 * POST — desfaz a inativação: a situação anterior volta. Fila do robô e agenda canceladas não
 * voltam sozinhas; quem reativa decide o próximo passo pela ficha.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if (g.erro) return g.erro;
  const id = Number((await params).id);
  const adm = supabaseAdmin();
  const { data: d } = await adm.from("devedores").select("id, nome, carteira_id").eq("id", id).maybeSingle();
  if (!d) return NextResponse.json({ erro: "Devedor não encontrado." }, { status: 404 });

  const { data, error } = await adm.rpc("fn_reativar_devedor", { p_devedor_id: id });
  if (error) return NextResponse.json({ erro: error.message.includes("nao_inativo") ? "Este cliente não está inativo." : "Não foi possível reativar." }, { status: 400 });

  await registrarAuditoria(adm, g.sessao, {
    acao: "devedor_reativado", entidade: "devedor", entidade_id: id, carteira_id: d.carteira_id, devedor_id: id,
    detalhe: { nome: d.nome, ...(data as Record<string, unknown>) },
  });
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
