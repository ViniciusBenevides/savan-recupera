import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirOperador, carteiraDoDevedorSePodeOperar } from "@/lib/auth";
import { extrairTextoDocumento } from "@/lib/juridico/texto";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "documentos-devedores";
const LIMITE = 15 * 1024 * 1024;

/**
 * POST (multipart) — anexa um documento à ficha: contrato, nota, comprovante de entrega, protesto…
 * campos: tipo, nome?, observacao?, arquivo? (pode ser só o registro, sem arquivo)
 * O texto de PDF com camada de texto, DOCX, TXT, CSV e HTML é guardado para a triagem jurídica
 * achar valores, datas e sinais (sem OCR: PDF escaneado fica só com tipo, nome e observação).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirOperador();
  if (g.erro) return g.erro;
  const devedorId = Number((await params).id);
  const cart = await carteiraDoDevedorSePodeOperar(g.sessao, devedorId);
  if (!cart) return NextResponse.json({ erro: "Você não pode trabalhar este devedor." }, { status: 403 });

  const form = await req.formData();
  const tipo = String(form.get("tipo") ?? "").trim().slice(0, 80);
  const arquivo = form.get("arquivo");
  const temArquivo = arquivo instanceof File && arquivo.size > 0;
  const nome = (String(form.get("nome") ?? "").trim() || (temArquivo ? (arquivo as File).name : "")).slice(0, 200);
  const observacao = String(form.get("observacao") ?? "").trim().slice(0, 2000) || null;
  if (!tipo) return NextResponse.json({ erro: "Escolha o tipo do documento." }, { status: 400 });
  if (!nome) return NextResponse.json({ erro: "Dê um nome ao documento ou escolha o arquivo." }, { status: 400 });
  if (temArquivo && (arquivo as File).size > LIMITE) return NextResponse.json({ erro: "Arquivo maior que 15 MB." }, { status: 400 });

  const adm = supabaseAdmin();
  let caminho: string | null = null;
  let texto = "";
  let mime: string | null = null;
  if (temArquivo) {
    const f = arquivo as File;
    const buf = Buffer.from(await f.arrayBuffer());
    mime = f.type || "application/octet-stream";
    texto = await extrairTextoDocumento(buf, f.name, mime);
    const seguro = f.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "documento";
    caminho = `${cart.carteira_id}/${devedorId}/${Date.now()}-${seguro}`;
    const { error } = await adm.storage.from(BUCKET).upload(caminho, buf, { contentType: mime, upsert: false });
    if (error) return NextResponse.json({ erro: `Não foi possível guardar o arquivo: ${error.message}` }, { status: 400 });
  }

  const { data, error } = await adm.from("devedor_documentos").insert({
    devedor_id: devedorId, carteira_id: cart.carteira_id, tipo, nome, observacao, arquivo_path: caminho,
    arquivo_mime: mime, arquivo_tamanho: temArquivo ? (arquivo as File).size : null, texto_extraido: texto || null,
    criado_por: g.sessao.user.id, criado_por_nome: g.sessao.nome,
  }).select("id").single();
  if (error) {
    if (caminho) await adm.storage.from(BUCKET).remove([caminho]);
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: data.id, texto_extraido: texto.length > 0 });
}
