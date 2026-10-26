import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirOperador, carteiraDoDevedorSePodeOperar } from "@/lib/auth";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PATCH — dados do título para a triagem jurídica: espécie, emissão, prescrição conferida e observação.
 * body: { titulo_especie?, titulo_emissao?, prescricao_em?, titulo_observacao? } ("" limpa o campo)
 * Vencimento e saldo continuam vindo da planilha da carteira.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirOperador();
  if (g.erro) return g.erro;
  const id = Number((await params).id);
  const cart = await carteiraDoDevedorSePodeOperar(g.sessao, id);
  if (!cart) return NextResponse.json({ erro: "Você não pode trabalhar este devedor." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, string | null> = {};
  if ("titulo_especie" in b) patch.titulo_especie = String(b.titulo_especie ?? "").trim().slice(0, 80) || null;
  if ("titulo_observacao" in b) patch.titulo_observacao = String(b.titulo_observacao ?? "").trim().slice(0, 2000) || null;
  for (const k of ["titulo_emissao", "prescricao_em"] as const) {
    if (!(k in b)) continue;
    const v = String(b[k] ?? "");
    if (v && !DATA.test(v)) return NextResponse.json({ erro: k === "prescricao_em" ? "Data de prescrição inválida." : "Data de emissão inválida." }, { status: 400 });
    patch[k] = v || null;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ erro: "Nada para salvar." }, { status: 400 });
  const { error } = await supabaseAdmin().from("devedores").update(patch).eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
