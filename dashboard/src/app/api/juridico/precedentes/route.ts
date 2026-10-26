import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { DOMINIOS_PRECEDENTES, buscarFonteOficial, urlEmDominioPermitido } from "@/lib/juridico/fontes";

export const runtime = "nodejs";
export const maxDuration = 30;

const TRIBUNAIS = ["STJ", "STF", "TJGO", "TJMT"];

/**
 * POST — cadastra uma decisão oficial no banco de precedentes.
 * body: { tribunal, processo?, tema?, tese, nivel: "A"|"B"|"C", publicado_em?, url_oficial, observacao? }
 * O motor nunca inventa jurisprudência: só entra decisão com URL do STF, STJ, TJGO ou TJMT, e a URL
 * é aberta agora para confirmar que existe.
 */
export async function POST(req: Request) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const b = await req.json().catch(() => ({}));
  const tribunal = String(b?.tribunal ?? "").trim().toUpperCase();
  const url = String(b?.url_oficial ?? "").trim().slice(0, 500);
  const tese = String(b?.tese ?? "").trim().slice(0, 8000);
  const nivel = ["A", "B", "C"].includes(b?.nivel) ? b.nivel : "B";
  if (!TRIBUNAIS.includes(tribunal)) return NextResponse.json({ erro: "Escolha o tribunal: STF, STJ, TJGO ou TJMT." }, { status: 400 });
  if (!tese) return NextResponse.json({ erro: "Escreva a tese ou a conclusão da decisão." }, { status: 400 });
  if (!url.startsWith("https://") || !urlEmDominioPermitido(url, DOMINIOS_PRECEDENTES)) {
    return NextResponse.json({ erro: "Use o link oficial da decisão, no site do STF, STJ, TJGO ou TJMT (começando com https://)." }, { status: 400 });
  }
  const verificacao = await buscarFonteOficial({ url }, 15000);
  if (!verificacao.ok) return NextResponse.json({ erro: `Não consegui abrir o link oficial agora (${verificacao.erro || "fonte indisponível"}). Confira o endereço e tente de novo.` }, { status: 400 });

  const publicado = /^\d{4}-\d{2}-\d{2}$/.test(String(b?.publicado_em ?? "")) ? b.publicado_em : null;
  const adm = supabaseAdmin();
  const { data, error } = await adm.from("juridico_precedentes").insert({
    tribunal, processo: String(b?.processo ?? "").trim().slice(0, 120) || null, tema: String(b?.tema ?? "").trim().slice(0, 200) || null,
    tese, nivel, publicado_em: publicado, url_oficial: url, verificado_em: new Date().toISOString(),
    observacao: String(b?.observacao ?? "").trim().slice(0, 2000) || null, criado_por: g.sessao.user.id,
  }).select("id").single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  await registrarAuditoria(adm, g.sessao, { acao: "juridico_precedente", entidade: "juridico_precedente", entidade_id: data.id, detalhe: { tribunal, processo: b?.processo ?? null } });
  return NextResponse.json({ ok: true, id: data.id });
}
