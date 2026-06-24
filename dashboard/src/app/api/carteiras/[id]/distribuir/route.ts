import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarCarteira, erroDono } from "@/lib/auth";

const ESTRATEGIAS = ["igualitario", "uf", "cidade", "manual"];

// POST { estrategia, atribuicoes:[{chip_id, ufs?, cidades?}] }
// Grava as regiões nos chips (uf/cidade/manual), define a estratégia da carteira e
// (re)carimba a fila chamando fn_distribuir_carteira. Retorna quantos devedores ficaram designados.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const carteiraId = Number(id);
  if (!(await podeEditarCarteira(g.sessao, carteiraId))) return erroDono();
  // cobrador só mexe nos próprios chips; admin em todos
  const soMeu = g.sessao.role === "cobrador" ? g.sessao.user.id : null;

  const { estrategia, atribuicoes } = await req.json();
  if (!ESTRATEGIAS.includes(estrategia)) return NextResponse.json({ erro: "estrategia_invalida" }, { status: 400 });

  const admin = supabaseAdmin();

  // 1) regiões nos chips (só para estratégias geográficas)
  if (estrategia === "uf" || estrategia === "cidade" || estrategia === "manual") {
    // limpa as regiões dos chips utilizáveis (do cobrador) antes de aplicar as novas
    let limpar = admin.from("chips").update({ regiao_uf: null, regiao_cidade: null })
      .in("status", ["cadastrado", "conectado", "aquecendo", "ativo"]);
    if (soMeu) limpar = limpar.eq("cobrador_id", soMeu);
    await limpar;
    for (const a of (atribuicoes ?? []) as Array<{ chip_id: number; ufs?: string[]; cidades?: string[] }>) {
      const patch: Record<string, unknown> = {};
      if (Array.isArray(a.ufs)) patch.regiao_uf = a.ufs.length ? a.ufs : null;
      if (Array.isArray(a.cidades)) patch.regiao_cidade = a.cidades.length ? a.cidades : null;
      if (Object.keys(patch).length) {
        let upd = admin.from("chips").update(patch).eq("id", a.chip_id);
        if (soMeu) upd = upd.eq("cobrador_id", soMeu);
        await upd;
      }
    }
  }

  // 2) estratégia na carteira
  const { error: e1 } = await admin.from("carteiras").update({ estrategia_distribuicao: estrategia }).eq("id", carteiraId);
  if (e1) return NextResponse.json({ erro: e1.message }, { status: 400 });

  // 3) (re)carimba a fila
  const { data: designados, error: e2 } = await admin.rpc("fn_distribuir_carteira", {
    p_carteira_id: carteiraId, p_estrategia: estrategia,
  });
  if (e2) return NextResponse.json({ erro: e2.message }, { status: 400 });

  return NextResponse.json({ ok: true, designados: designados ?? 0 });
}
