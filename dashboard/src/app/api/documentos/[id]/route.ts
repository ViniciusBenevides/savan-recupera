import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { getSessao, exigirCobrador } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { carteiraDoJuridico } from "@/lib/juridico/acesso";

const BUCKET = "documentos-devedores";

/** GET — abre o arquivo do documento por um link assinado de 5 minutos (só quem enxerga o devedor). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessao())) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  const id = Number((await params).id);
  const sb = await supabaseServer();
  const { data: doc } = await sb.from("devedor_documentos").select("id, nome, arquivo_path").eq("id", id).maybeSingle();
  if (!doc?.arquivo_path) return NextResponse.json({ erro: "Documento sem arquivo." }, { status: 404 });
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(doc.arquivo_path, 300, { download: doc.nome });
  if (error || !data?.signedUrl) return NextResponse.json({ erro: "Não foi possível abrir o arquivo." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, 302);
}

/**
 * DELETE — tira um documento da ficha (anexado errado). Só quem decide o Jurídico; fica na
 * auditoria, porque documento é prova.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const id = Number((await params).id);
  const adm = supabaseAdmin();
  const { data: doc } = await adm.from("devedor_documentos").select("id, devedor_id, carteira_id, tipo, nome, arquivo_path").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ erro: "Documento não encontrado." }, { status: 404 });
  if (!(await carteiraDoJuridico(g.sessao, doc.devedor_id))) return NextResponse.json({ erro: "Você não pode mexer nos documentos deste devedor." }, { status: 403 });
  const { error } = await adm.from("devedor_documentos").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  if (doc.arquivo_path) await adm.storage.from(BUCKET).remove([doc.arquivo_path]);
  await registrarAuditoria(adm, g.sessao, { acao: "documento_excluido", entidade: "documento", entidade_id: id, carteira_id: doc.carteira_id, devedor_id: doc.devedor_id, detalhe: { tipo: doc.tipo, nome: doc.nome } });
  return NextResponse.json({ ok: true });
}
