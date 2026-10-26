import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { carteiraDoJuridico } from "@/lib/juridico/acesso";
import { criarAnalise } from "@/lib/juridico/servico";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST — analisa um devedor e gera a minuta. body: { devedor_id, usar_ia?: boolean }
 * O "analisar lote" da tela chama esta rota um devedor por vez: cada análise com IA leva dezenas de
 * segundos, e uma rota só para o lote inteiro estouraria o tempo da Vercel.
 */
export async function POST(req: Request) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const b = await req.json().catch(() => ({}));
  const devedorId = Number(b?.devedor_id);
  if (!Number.isInteger(devedorId) || devedorId <= 0) return NextResponse.json({ erro: "Devedor inválido." }, { status: 400 });
  const cart = await carteiraDoJuridico(g.sessao, devedorId);
  if (!cart) return NextResponse.json({ erro: "Você não pode analisar este devedor." }, { status: 403 });

  const adm = supabaseAdmin();
  try {
    const a = await criarAnalise(adm, g.sessao, devedorId, b?.usar_ia !== false);
    await registrarAuditoria(adm, g.sessao, {
      acao: "juridico_analise", entidade: "juridico_analise", entidade_id: a.id, carteira_id: cart.carteira_id, devedor_id: devedorId,
      detalhe: { medida: a.medida, confianca: a.confianca, fontes_do_dia: !!a.fontes_verificadas_em },
    });
    return NextResponse.json({ ok: true, analise_id: a.id, medida: a.medida, confianca: a.confianca, fontes_do_dia: !!a.fontes_verificadas_em });
  } catch (e) {
    return NextResponse.json({ erro: `Não foi possível analisar: ${e instanceof Error ? e.message : "erro"}` }, { status: 500 });
  }
}
