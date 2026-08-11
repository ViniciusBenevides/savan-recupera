import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarChip, erroDono } from "@/lib/auth";
import { configurarWebhookDoChip, dadosWebhookDoChip } from "@/lib/meta-webhook";

// (Re)configura o webhook do app da Meta deste chip. É o botão "Configurar webhook" do card —
// serve para quem conectou o número antes de ter App ID/Secret em mãos, para quando o Chatwoot
// mudou de endereço, ou para reparar depois de uma falha de validação.
//
// body: { forcar?: boolean } — `forcar` substitui uma assinatura que aponta para outra URL
// (só faça isso sabendo que o número que estava lá para de receber respostas).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chipId = Number(id);
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarChip(g.sessao, chipId))) return erroDono();

  const forcar = !!(await req.json().catch(() => ({})))?.forcar;

  const { data: cred } = await supabaseAdmin()
    .from("chips_credenciais_meta").select("app_id, app_secret").eq("chip_id", chipId).maybeSingle();
  if (!cred) return NextResponse.json({ erro: "Este chip não usa o conector Meta." }, { status: 400 });

  const { callback_url, verify_token } = await dadosWebhookDoChip(chipId);
  const r = await configurarWebhookDoChip({
    chipId, appId: cred.app_id, appSecret: cred.app_secret, callbackUrl: callback_url, verifyToken: verify_token, forcar,
  });

  // 409 no conflito para a UI poder oferecer o "substituir mesmo assim" sem confundir com erro de credencial
  if (!r.ok) {
    return NextResponse.json(
      { erro: r.mensagem, motivo: r.motivo, callback_url: r.callback_url, verify_token: r.verify_token },
      { status: r.motivo === "conflito" ? 409 : 400 },
    );
  }
  return NextResponse.json({ ok: true, motivo: r.motivo, mensagem: r.mensagem, callback_url: r.callback_url });
}
