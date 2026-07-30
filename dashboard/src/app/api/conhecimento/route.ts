import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirEscopoConta, getSessao, type Escopo } from "@/lib/auth";

// CRUD da base de conhecimento do bot (§33), escopado por conta como o resto do produto.
// body.acao: criar | atualizar | aprovar | reprovar | excluir   (+ body.conta p/ admin mirar um cobrador)
//
// Regra que dá sentido à tabela: QUALQUER edição de texto derruba `aprovado` para false. Uma resposta
// aprovada e depois alterada nunca volta ao bot sem passar de novo por um humano — é o mesmo gate que
// o cnpj.biz aplica aos documentos que alimentam a IA deles, e aqui vale mais ainda por causa das
// restrições jurídicas da cobrança (§1).

async function donoConfere(id: number, escopo: Escopo): Promise<boolean> {
  const { data } = await supabaseAdmin().from("bot_conhecimento").select("cobrador_id").eq("id", id).maybeSingle();
  if (!data) return false;
  return (data.cobrador_id ?? null) === escopo.cobradorId;
}

export async function POST(req: Request) {
  const body = await req.json();
  const g = await exigirEscopoConta(body.conta);
  if (g.erro) return g.erro;
  const { escopo } = g;
  const sessao = await getSessao();
  const admin = supabaseAdmin();

  if (body.acao === "criar") {
    const e = body.entrada ?? {};
    const pergunta = String(e.pergunta ?? "").trim();
    const resposta = String(e.resposta ?? "").trim();
    if (!pergunta || !resposta) return NextResponse.json({ erro: "pergunta_e_resposta_obrigatorias" }, { status: 400 });
    const { error } = await admin.from("bot_conhecimento").insert({
      pergunta, resposta,
      carteira_id: e.carteira_id ?? null,
      cobrador_id: escopo.cobradorId,
      criado_por: sessao?.user.id ?? null,
      aprovado: false,          // nasce sempre pendente
      ativo: e.ativo ?? true,
    });
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.acao === "atualizar") {
    if (!(await donoConfere(body.id, escopo))) return NextResponse.json({ erro: "sem_permissao_neste_recurso" }, { status: 403 });
    const p = body.patch ?? {};
    const mudouTexto = p.pergunta !== undefined || p.resposta !== undefined;
    const { error } = await admin.from("bot_conhecimento").update({
      ...(p.pergunta !== undefined ? { pergunta: String(p.pergunta).trim() } : {}),
      ...(p.resposta !== undefined ? { resposta: String(p.resposta).trim() } : {}),
      ...(p.ativo !== undefined ? { ativo: p.ativo } : {}),
      ...(p.carteira_id !== undefined ? { carteira_id: p.carteira_id } : {}),
      // editar o texto derruba a aprovação: o bot para de usar até alguém revisar de novo
      ...(mudouTexto ? { aprovado: false, aprovado_por: null, aprovado_em: null } : {}),
    }).eq("id", body.id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, aprovacao_derrubada: mudouTexto });
  }

  if (body.acao === "aprovar" || body.acao === "reprovar") {
    if (!(await donoConfere(body.id, escopo))) return NextResponse.json({ erro: "sem_permissao_neste_recurso" }, { status: 403 });
    const aprovando = body.acao === "aprovar";
    const { error } = await admin.from("bot_conhecimento").update({
      aprovado: aprovando,
      aprovado_por: aprovando ? sessao?.user.id ?? null : null,
      aprovado_em: aprovando ? new Date().toISOString() : null,
    }).eq("id", body.id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.acao === "excluir") {
    if (!(await donoConfere(body.id, escopo))) return NextResponse.json({ erro: "sem_permissao_neste_recurso" }, { status: 403 });
    const { error } = await admin.from("bot_conhecimento").delete().eq("id", body.id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erro: "acao_invalida" }, { status: 400 });
}
