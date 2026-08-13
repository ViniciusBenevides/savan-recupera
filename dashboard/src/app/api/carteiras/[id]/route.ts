import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarCarteira, erroDono } from "@/lib/auth";

const STATUS_VALIDOS = ["importando", "ativa", "pausada", "arquivada"];
// campos que o painel pode atualizar (credor_id liga o usuário-credor dono da carteira)
const CAMPOS = ["nome", "credor", "credor_id", "descricao", "status", "prompt_persona", "contexto_negocio", "guardrails", "config_override", "roteiro"];

// PATCH: atualiza status / overrides de prompt e config da carteira (admin ou cobrador dono)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarCarteira(g.sessao, Number(id)))) return erroDono();

  const b = await req.json();
  const patch: Record<string, unknown> = {};
  for (const c of CAMPOS) if (c in b) patch[c] = b[c];
  if ("status" in patch && !STATUS_VALIDOS.includes(String(patch.status))) {
    return NextResponse.json({ erro: "status_invalido" }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ erro: "nada_para_atualizar" }, { status: 400 });

  const admin = supabaseAdmin();
  let novaVersaoId: number | null = null;
  if ("roteiro" in patch) {
    const { data: carteira } = await admin.from("carteiras")
      .select("cobrador_id").eq("id", Number(id)).maybeSingle();
    const { data: ultima } = await admin.from("fluxo_versoes")
      .select("versao").eq("carteira_id", Number(id)).order("versao", { ascending: false }).limit(1).maybeSingle();
    const { data: configs } = await admin.from("configuracoes")
      .select("chave, valor, cobrador_id")
      .in("chave", ["meta_abordagem_template", "meta_abordagem_template_candidato"])
      .or(`cobrador_id.is.null,cobrador_id.eq.${carteira?.cobrador_id ?? g.sessao.user.id}`);
    const globais = new Map((configs ?? []).filter((c: any) => !c.cobrador_id).map((c: any) => [c.chave, c.valor]));
    const resolvida = (chave: string) => (configs ?? []).find((c: any) => c.chave === chave && c.cobrador_id)?.valor ?? globais.get(chave) ?? null;
    const numeroVersao = Number(ultima?.versao ?? 0) + 1;
    const { data: versao, error: erroVersao } = await admin.from("fluxo_versoes").insert({
      carteira_id: Number(id),
      versao: numeroVersao,
      nome: `Versão ${numeroVersao}`,
      roteiro: patch.roteiro,
      meta_abordagem_template: resolvida("meta_abordagem_template"),
      meta_abordagem_template_candidato: resolvida("meta_abordagem_template_candidato"),
      criado_por: g.sessao.user.id,
    }).select("id").single();
    if (erroVersao) return NextResponse.json({ erro: erroVersao.message }, { status: 400 });
    novaVersaoId = versao.id;
    patch.fluxo_versao_ativa_id = novaVersaoId;
  }
  const { error } = await admin.from("carteiras").update(patch).eq("id", Number(id));
  if (error) {
    if (novaVersaoId) await admin.from("fluxo_versoes").delete().eq("id", novaVersaoId);
    const dup = error.code === "23505";
    return NextResponse.json({ erro: dup ? "Já existe uma carteira com esse nome." : error.message }, { status: dup ? 409 : 400 });
  }
  return NextResponse.json({ ok: true, fluxo_versao_id: novaVersaoId });
}

// DELETE: apaga a carteira e tudo dela (cascade). admin ou cobrador dono.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarCarteira(g.sessao, Number(id)))) return erroDono();

  const admin = supabaseAdmin();
  const { error } = await admin.from("carteiras").delete().eq("id", Number(id));
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
