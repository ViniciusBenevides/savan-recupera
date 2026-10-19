import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirOperador, carteiraDoDevedorSePodeOperar } from "@/lib/auth";
import { instanteSP, diaISO } from "@/lib/datas";
import { brl } from "@/lib/utils";

const FORMAS = ["pix", "loja", "transferencia", "boleto", "dinheiro"] as const;
const NOME_FORMA: Record<string, string> = { pix: "Pix", loja: "na loja", transferencia: "transferência", boleto: "boleto", dinheiro: "dinheiro" };

/**
 * POST — registrar pagamento de uma parcela (entrada = parcela 0).
 * body: { valor, data: "AAAA-MM-DD", forma, observacao? }
 * Ao contrário do MC COB V5, o pagamento ABATE: a parcela fica paga e, quando é a última, o gatilho do
 * banco quita o acordo e põe o devedor como pago — ele sai da cobrança e não é chamado de novo.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirOperador();
  if (g.erro) return g.erro;
  const { sessao } = g;
  const id = Number((await params).id);
  const b = await req.json().catch(() => ({}));

  const adm = supabaseAdmin();
  const { data: p } = await adm.from("acordo_parcelas")
    .select("id, numero, valor, status, acordo_id, acordos!inner(id, devedor_id, carteira_id, status, parcelas)")
    .eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ erro: "Parcela não encontrada." }, { status: 404 });
  const ac = p.acordos as unknown as { id: number; devedor_id: number; carteira_id: number; status: string; parcelas: number };
  if (!(await carteiraDoDevedorSePodeOperar(sessao, ac.devedor_id))) return NextResponse.json({ erro: "Você não pode trabalhar este devedor." }, { status: 403 });
  if (p.status !== "aberta") return NextResponse.json({ erro: "Esta parcela já está paga ou cancelada." }, { status: 409 });
  if (ac.status !== "ativo") return NextResponse.json({ erro: "O acordo desta parcela não está ativo." }, { status: 409 });

  const valor = Number(String(b?.valor ?? p.valor).replace(",", "."));
  if (!(valor > 0)) return NextResponse.json({ erro: "Informe o valor recebido." }, { status: 400 });
  const data = String(b?.data ?? diaISO());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > diaISO()) return NextResponse.json({ erro: "A data do pagamento não pode ser no futuro." }, { status: 400 });
  const forma = FORMAS.includes(b?.forma) ? b.forma : "pix";
  const [a, m, d] = data.split("-").map(Number);

  const { error } = await adm.from("acordo_parcelas").update({
    status: "paga", valor_pago: valor, forma_pagamento: forma, pago_em: instanteSP(a, m, d, 12, 0).toISOString(),
    registrado_por: sessao.user.id, observacao: b?.observacao ? String(b.observacao).slice(0, 500) : null,
  }).eq("id", id).eq("status", "aberta");
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  const rotulo = p.numero === 0 ? "a entrada" : `a parcela ${p.numero} de ${ac.parcelas}`;
  const diferenca = valor + 0.009 < Number(p.valor) ? ` (${brl(Number(p.valor) - valor)} a menos que o combinado)` : "";
  await adm.from("ocorrencias").insert({
    devedor_id: ac.devedor_id, carteira_id: ac.carteira_id, autor_id: sessao.user.id, autor_nome: sessao.nome,
    canal: "sistema", resultado: "pagou", descricao: `Pagou ${rotulo}: ${brl(valor)} ${NOME_FORMA[forma]}${diferenca}.`,
  });

  const { data: acordo } = await adm.from("acordos").select("status").eq("id", ac.id).single();
  return NextResponse.json({ ok: true, acordo_quitado: acordo?.status === "quitado" });
}
