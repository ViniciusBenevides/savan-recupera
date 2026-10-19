import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirOperador, carteiraDoDevedorSePodeOperar } from "@/lib/auth";
import { simularAcordo } from "@/lib/acordo";
import { brl } from "@/lib/utils";
import { dataCurta } from "@/lib/datas";

const FORMAS = ["pix", "loja", "transferencia", "boleto", "dinheiro"] as const;

/**
 * POST — "Fechar acordo" (a calculadora do MC COB, com os limites da carteira).
 * body: { devedor_id, desconto_pct, parcelas, entrada, primeiro_vencimento: "AAAA-MM-DD", forma_pagamento, observacao? }
 * O servidor refaz a conta com simularAcordo; o que veio do navegador é só o pedido.
 * Desconto acima do limite da carteira: o negociador não grava (pede liberação); cobrador e admin
 * gravam e ficam registrados como quem liberou.
 */
export async function POST(req: Request) {
  const g = await exigirOperador();
  if (g.erro) return g.erro;
  const { sessao } = g;
  const b = await req.json().catch(() => ({}));
  const devedorId = Number(b?.devedor_id);
  const cart = await carteiraDoDevedorSePodeOperar(sessao, devedorId);
  if (!cart) return NextResponse.json({ erro: "Você não pode trabalhar este devedor." }, { status: 403 });

  const adm = supabaseAdmin();
  const [{ data: dev }, { data: carteira }, { data: bloq }] = await Promise.all([
    adm.from("devedores").select("id, saldo, status_cobranca").eq("id", devedorId).single(),
    adm.from("carteiras").select("desconto_max_pct, parcelas_max, entrada_min_pct, parcela_min_valor").eq("id", cart.carteira_id).single(),
    adm.from("bloqueios_contato").select("motivo").eq("devedor_id", devedorId).limit(1),
  ]);
  if (!dev || !carteira) return NextResponse.json({ erro: "Devedor não encontrado." }, { status: 404 });
  if (dev.status_cobranca === "pago") return NextResponse.json({ erro: "Este devedor já está pago." }, { status: 409 });
  if ((bloq?.length ?? 0) > 0) return NextResponse.json({ erro: "Esta pessoa pediu para não ser contatada. Não é possível fazer acordo." }, { status: 409 });

  const forma = FORMAS.includes(b?.forma_pagamento) ? b.forma_pagamento : "pix";
  const sim = simularAcordo(
    {
      valor_divida: Number(dev.saldo),
      desconto_pct: Number(b?.desconto_pct) || 0,
      parcelas: Number(b?.parcelas) || 1,
      entrada: Number(b?.entrada) || 0,
      primeiro_vencimento: String(b?.primeiro_vencimento ?? ""),
    },
    {
      desconto_max_pct: Number(carteira.desconto_max_pct),
      parcelas_max: Number(carteira.parcelas_max),
      entrada_min_pct: Number(carteira.entrada_min_pct),
      parcela_min_valor: Number(carteira.parcela_min_valor),
    },
  );
  if (sim.problemas.length) return NextResponse.json({ erro: sim.problemas.join(" "), problemas: sim.problemas }, { status: 400 });
  if (sim.precisa_liberacao && sessao.role === "negociador") {
    return NextResponse.json({ erro: `O desconto passa do limite da carteira (${carteira.desconto_max_pct}%). Peça a liberação ao dono da operação.` }, { status: 403 });
  }
  const primeiro = sim.parcelas[0]?.vencimento;
  if (primeiro && primeiro < new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)) {
    return NextResponse.json({ erro: "O primeiro pagamento não pode ser no passado." }, { status: 400 });
  }

  const { data: ativo } = await adm.from("acordos").select("id").eq("devedor_id", devedorId).eq("status", "ativo").maybeSingle();
  if (ativo) return NextResponse.json({ erro: "Já existe um acordo ativo. Quebre ou cancele o atual antes de fazer outro." }, { status: 409 });

  const nParcelas = sim.parcelas.filter((p) => p.numero > 0).length;
  const { data: acordo, error } = await adm.from("acordos").insert({
    devedor_id: devedorId, carteira_id: cart.carteira_id, criado_por: sessao.user.id, criado_por_nome: sessao.nome,
    valor_divida: Number(dev.saldo), desconto_pct: Number(b?.desconto_pct) || 0, valor_total: sim.valor_total,
    entrada: sim.entrada, parcelas: Math.max(1, nParcelas), forma_pagamento: forma,
    liberado_por: sim.precisa_liberacao ? sessao.user.id : null,
    observacao: b?.observacao ? String(b.observacao).slice(0, 1000) : null,
  }).select("id").single();
  if (error) return NextResponse.json({ erro: error.message.includes("uq_acordo_ativo") ? "Já existe um acordo ativo." : error.message }, { status: 400 });

  const { error: eParc } = await adm.from("acordo_parcelas").insert(
    sim.parcelas.map((p) => ({ acordo_id: acordo.id, numero: p.numero, vencimento: p.vencimento, valor: p.valor })),
  );
  if (eParc) {
    await adm.from("acordos").delete().eq("id", acordo.id);
    return NextResponse.json({ erro: eParc.message }, { status: 400 });
  }

  // O acordo substitui as promessas soltas; a ocorrência conta o combinado em uma frase.
  await adm.from("agenda").update({ status: "cancelada", concluido_em: new Date().toISOString() })
    .eq("devedor_id", devedorId).eq("tipo", "promessa").eq("status", "pendente");
  const resumo = sim.parcelas.length === 1
    ? `À vista de ${brl(sim.valor_total)} para ${dataCurta(sim.parcelas[0].vencimento)}`
    : `${sim.entrada > 0 ? `Entrada de ${brl(sim.entrada)} + ` : ""}${nParcelas}x de ${brl(sim.valor_parcela)} (total ${brl(sim.valor_total)}), 1º em ${dataCurta(sim.parcelas[0].vencimento)}`;
  await adm.from("ocorrencias").insert({
    devedor_id: devedorId, carteira_id: cart.carteira_id, autor_id: sessao.user.id, autor_nome: sessao.nome,
    canal: "whatsapp", resultado: "acordo",
    descricao: `${resumo}. Desconto de ${Number(b?.desconto_pct) || 0}%.${sim.precisa_liberacao ? " Liberado acima do limite da carteira." : ""}`,
  });
  await adm.from("devedores").update({ responsavel_id: sessao.user.id }).eq("id", devedorId).is("responsavel_id", null);

  return NextResponse.json({ ok: true, acordo_id: acordo.id });
}
