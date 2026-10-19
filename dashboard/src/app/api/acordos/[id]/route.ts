import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirOperador, carteiraDoDevedorSePodeOperar } from "@/lib/auth";

/**
 * PATCH — encerra um acordo ativo. body: { acao: "quebrar" | "cancelar", motivo? }
 * "quebrar" = a pessoa parou de pagar (as parcelas abertas são canceladas e o devedor volta para a
 * cobrança); "cancelar" = o acordo foi feito errado e será refeito.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirOperador();
  if (g.erro) return g.erro;
  const { sessao } = g;
  const id = Number((await params).id);
  const b = await req.json().catch(() => ({}));
  const acao = b?.acao === "cancelar" ? "cancelar" : b?.acao === "quebrar" ? "quebrar" : null;
  if (!acao) return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });

  const adm = supabaseAdmin();
  const { data: ac } = await adm.from("acordos").select("id, devedor_id, carteira_id, status").eq("id", id).maybeSingle();
  if (!ac) return NextResponse.json({ erro: "Acordo não encontrado." }, { status: 404 });
  if (!(await carteiraDoDevedorSePodeOperar(sessao, ac.devedor_id))) return NextResponse.json({ erro: "Você não pode trabalhar este devedor." }, { status: 403 });
  if (ac.status !== "ativo") return NextResponse.json({ erro: "Este acordo já está encerrado." }, { status: 409 });

  const agora = new Date().toISOString();
  await adm.from("acordos").update({ status: acao === "quebrar" ? "quebrado" : "cancelado", encerrado_em: agora }).eq("id", id);
  await adm.from("acordo_parcelas").update({ status: "cancelada" }).eq("acordo_id", id).eq("status", "aberta");
  await adm.from("ocorrencias").insert({
    devedor_id: ac.devedor_id, carteira_id: ac.carteira_id, autor_id: sessao.user.id, autor_nome: sessao.nome,
    canal: "sistema", resultado: "anotacao",
    descricao: `${acao === "quebrar" ? "Acordo quebrado" : "Acordo cancelado"}${b?.motivo ? `: ${String(b.motivo).slice(0, 300)}` : "."}`,
  });
  await adm.from("devedores").update({ status_cobranca: "em_negociacao" }).eq("id", ac.devedor_id).neq("status_cobranca", "pago");
  return NextResponse.json({ ok: true });
}
