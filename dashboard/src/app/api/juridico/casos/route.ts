import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { carteiraDoJuridico } from "@/lib/juridico/acesso";
import { lerCaso } from "@/lib/juridico/casos";

/** POST — abre um caso jurídico à mão, sem passar pela análise. body: { devedor_id, etapa, acao, ... } */
export async function POST(req: Request) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const b = await req.json().catch(() => ({}));
  const devedorId = Number(b?.devedor_id);
  const cart = await carteiraDoJuridico(g.sessao, devedorId);
  if (!cart) return NextResponse.json({ erro: "Você não pode decidir o Jurídico deste devedor." }, { status: 403 });
  const lido = lerCaso({ etapa: "Pré-jurídico", prioridade: "Média", status: "Aberto", acao: "Ação de cobrança", ...b });
  if ("erro" in lido) return NextResponse.json({ erro: lido.erro }, { status: 400 });

  const adm = supabaseAdmin();
  const { data, error } = await adm.from("juridico_casos").insert({
    ...lido.patch, devedor_id: devedorId, carteira_id: cart.carteira_id, criado_por: g.sessao.user.id,
  }).select("id").single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  await adm.from("ocorrencias").insert({
    devedor_id: devedorId, carteira_id: cart.carteira_id, autor_id: g.sessao.user.id, autor_nome: g.sessao.nome,
    canal: "sistema", resultado: "anotacao", descricao: `Caso jurídico aberto: ${lido.patch.acao} (${lido.patch.etapa}).`,
  });
  await registrarAuditoria(adm, g.sessao, { acao: "juridico_caso_criado", entidade: "juridico_caso", entidade_id: data.id, carteira_id: cart.carteira_id, devedor_id: devedorId, detalhe: lido.patch });
  return NextResponse.json({ ok: true, id: data.id });
}
