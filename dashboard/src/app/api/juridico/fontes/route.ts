import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { sincronizarFontes } from "@/lib/juridico/servico";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST — "Sincronizar fontes oficiais agora": lê de novo todas as fontes, mesmo as já confirmadas hoje. */
export async function POST() {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const adm = supabaseAdmin();
  const r = await sincronizarFontes(adm, { forcar: true });
  const ok = r.filter((x) => x.ok).length;
  const viaPesquisa = r.filter((x) => x.limitada).length;
  const alteradas = r.filter((x) => x.alterada).length;
  const falhas = r.length - ok - viaPesquisa;
  await registrarAuditoria(adm, g.sessao, { acao: "juridico_fontes_sincronizadas", entidade: "juridico_fontes", detalhe: { ok, viaPesquisa, alteradas, falhas } });
  return NextResponse.json({ ok: true, confirmadas: ok, via_pesquisa: viaPesquisa, alteradas, falhas, resultados: r });
}
