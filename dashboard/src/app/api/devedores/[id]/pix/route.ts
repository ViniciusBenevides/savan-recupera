import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirOperador, carteiraDoDevedorSePodeOperar } from "@/lib/auth";
import { modoDemoLocal } from "@/lib/demo";

/**
 * POST — gera o Pix de quitação pelo painel. body: { valor?, conversa_id? }
 * O preço quem decide é a Edge Function `gerar-pix` (fn_proposta + faixa permitida); o valor
 * pedido aqui só é aceito dentro dela. Em demonstração local, grava um Pix falso sem chamar o Asaas.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirOperador();
  if (g.erro) return g.erro;
  const devedorId = Number((await params).id);
  const b = await req.json().catch(() => ({}));
  const cart = await carteiraDoDevedorSePodeOperar(g.sessao, devedorId);
  if (!cart) return NextResponse.json({ erro: "Você não pode trabalhar este devedor." }, { status: 403 });

  const adm = supabaseAdmin();
  const { data: bloq } = await adm.from("bloqueios_contato").select("id").eq("devedor_id", devedorId).limit(1);
  if ((bloq?.length ?? 0) > 0) return NextResponse.json({ erro: "Esta pessoa pediu para não ser contatada." }, { status: 409 });

  if (modoDemoLocal()) {
    const { data: dev } = await adm.from("devedores").select("saldo").eq("id", devedorId).single();
    const valor = Number(b?.valor) > 0 ? Number(b.valor) : Number(dev?.saldo ?? 0);
    const copia = `00020126DEMO-PIX-NAO-PAGUE-${devedorId}-${Date.now()}`;
    const { data: neg } = await adm.from("negociacoes").insert({ devedor_id: devedorId, conversa_id: Number(b?.conversa_id) || null, valor_original: dev?.saldo ?? valor, desconto_pct: 0, valor_proposto: valor, status: "aceita" }).select("id").single();
    await adm.from("pagamentos").insert({ negociacao_id: neg?.id, devedor_id: devedorId, asaas_payment_id: `demo_${Date.now()}`, valor, status: "pendente", pix_payload: copia, due_date: new Date().toISOString().slice(0, 10) });
    await adm.from("devedores").update({ status_cobranca: "pix_gerado" }).eq("id", devedorId).neq("status_cobranca", "pago");
    return NextResponse.json({ ok: true, demo: true, valor_final: valor, copia_e_cola: copia });
  }

  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/gerar-pix`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ devedor_id: devedorId, valor_final: Number(b?.valor) || undefined, conversa_id: Number(b?.conversa_id) || null }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) return NextResponse.json({ erro: j?.erro ?? "O Asaas não gerou o Pix agora. Tente de novo em instantes." }, { status: 400 });
  return NextResponse.json({ ok: true, valor_final: j.valor_final, copia_e_cola: j.pix_copia_cola, invoice_url: j.invoice_url });
}
