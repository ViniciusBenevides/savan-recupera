import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirEscopoConta, podeEditarCarteira, type Escopo, type Sessao } from "@/lib/auth";

// CRUD da base de conhecimento do bot (§33), agora ancorado na CARTEIRA (§35).
// body.acao: criar | atualizar | aprovar | reprovar | excluir   (+ body.carteira_id, de onde vem a tela)
//
// Autorização em dois caminhos, porque a tabela tem dois tipos de linha:
//   • entrada de uma carteira  → manda quem pode editar a carteira (admin, ou o cobrador dono);
//   • entrada sem carteira     → formato antigo, "vale para todas": cai no escopo por conta.
//
// Regra que dá sentido à tabela: QUALQUER edição de texto derruba `aprovado` para false. Uma resposta
// aprovada e depois alterada nunca volta ao bot sem passar de novo por um humano — é o mesmo gate que
// o cnpj.biz aplica aos documentos que alimentam a IA deles, e aqui vale mais ainda por causa das
// restrições jurídicas da cobrança (§1).

async function podeMexer(id: number, sessao: Sessao, escopo: Escopo): Promise<boolean> {
  const { data } = await supabaseAdmin().from("bot_conhecimento")
    .select("cobrador_id, carteira_id").eq("id", id).maybeSingle();
  if (!data) return false;
  if (data.carteira_id) return podeEditarCarteira(sessao, data.carteira_id);
  return (data.cobrador_id ?? null) === escopo.cobradorId;
}

export async function POST(req: Request) {
  const body = await req.json();
  const carteiraId = body.carteira_id ? Number(body.carteira_id) : null;
  const g = await exigirEscopoConta(body.conta);
  if (g.erro) return g.erro;
  const { escopo, sessao } = g;
  const admin = supabaseAdmin();

  if (carteiraId && !(await podeEditarCarteira(sessao, carteiraId))) {
    return NextResponse.json({ erro: "sem_permissao_nesta_carteira" }, { status: 403 });
  }

  if (body.acao === "criar") {
    const e = body.entrada ?? {};
    const pergunta = String(e.pergunta ?? "").trim();
    const resposta = String(e.resposta ?? "").trim();
    if (!pergunta || !resposta) return NextResponse.json({ erro: "pergunta_e_resposta_obrigatorias" }, { status: 400 });
    // a entrada nasce da carteira, então herda o dono dela (e não a conta que o admin está olhando)
    let cobradorId = escopo.cobradorId;
    if (carteiraId) {
      const { data: cart } = await admin.from("carteiras").select("cobrador_id").eq("id", carteiraId).maybeSingle();
      cobradorId = cart?.cobrador_id ?? null;
    }
    const { error } = await admin.from("bot_conhecimento").insert({
      pergunta, resposta,
      carteira_id: carteiraId ?? e.carteira_id ?? null,
      cobrador_id: cobradorId,
      criado_por: sessao.user.id,
      aprovado: false,          // nasce sempre pendente
      ativo: e.ativo ?? true,
    });
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.acao === "atualizar") {
    if (!(await podeMexer(body.id, sessao, escopo))) return NextResponse.json({ erro: "sem_permissao_neste_recurso" }, { status: 403 });
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
    if (!(await podeMexer(body.id, sessao, escopo))) return NextResponse.json({ erro: "sem_permissao_neste_recurso" }, { status: 403 });
    const aprovando = body.acao === "aprovar";
    const { error } = await admin.from("bot_conhecimento").update({
      aprovado: aprovando,
      aprovado_por: aprovando ? sessao.user.id : null,
      aprovado_em: aprovando ? new Date().toISOString() : null,
    }).eq("id", body.id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.acao === "excluir") {
    if (!(await podeMexer(body.id, sessao, escopo))) return NextResponse.json({ erro: "sem_permissao_neste_recurso" }, { status: 403 });
    const { error } = await admin.from("bot_conhecimento").delete().eq("id", body.id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erro: "acao_invalida" }, { status: 400 });
}
