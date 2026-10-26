import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

/**
 * PUT — meta diária de uma pessoa da equipe (V5.6.14). body: { usuario_id, meta_clientes, meta_acionamentos }
 * O dono da operação define para ele mesmo e para os negociadores dele; o admin, para qualquer um.
 * 0 = sem meta.
 */
export async function PUT(req: Request) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const b = await req.json().catch(() => ({}));
  const alvo = String(b?.usuario_id ?? "");
  const lerMeta = (v: unknown) => Math.round(Number(v ?? 0));
  const clientes = lerMeta(b?.meta_clientes);
  const acionamentos = lerMeta(b?.meta_acionamentos);
  if (![clientes, acionamentos].every((n) => Number.isFinite(n) && n >= 0 && n <= 1000)) {
    return NextResponse.json({ erro: "Use metas de 0 a 1.000 por dia." }, { status: 400 });
  }

  const adm = supabaseAdmin();
  const { data: u } = await adm.from("usuarios_app").select("id, nome, role, cobrador_id").eq("id", alvo).maybeSingle();
  if (!u || !["cobrador", "negociador", "admin"].includes(u.role)) return NextResponse.json({ erro: "Pessoa não encontrada na equipe." }, { status: 404 });
  const daEquipe = g.sessao.role === "admin" || u.id === g.sessao.user.id || (u.role === "negociador" && u.cobrador_id === g.sessao.user.id);
  if (!daEquipe) return NextResponse.json({ erro: "Essa pessoa não é da sua equipe." }, { status: 403 });

  const { error } = await adm.from("metas_produtividade").upsert({
    usuario_id: u.id, meta_clientes: clientes, meta_acionamentos: acionamentos, atualizado_por: g.sessao.user.id, atualizado_em: new Date().toISOString(),
  }, { onConflict: "usuario_id" });
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  await registrarAuditoria(adm, g.sessao, { acao: "meta_produtividade", entidade: "usuario", entidade_id: u.id, detalhe: { nome: u.nome, meta_clientes: clientes, meta_acionamentos: acionamentos } });
  return NextResponse.json({ ok: true });
}
