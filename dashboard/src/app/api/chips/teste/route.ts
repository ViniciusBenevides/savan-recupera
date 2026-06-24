import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarChip, erroDono } from "@/lib/auth";
import { garantirWebhookEntrada } from "@/lib/zapi";

// Dispara a mensagem de teste para o número de teste (configurado na tela de Chips),
// usando o chip escolhido. Chama a Edge Function disparar-teste com o service role.
export async function POST(req: Request) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;

  const { chip_id, numero_e164 } = await req.json();
  if (!chip_id) return NextResponse.json({ erro: "chip_obrigatorio" }, { status: 400 });
  if (!(await podeEditarChip(g.sessao, Number(chip_id)))) return erroDono();

  // Garante que o webhook "ao receber" da Z-API aponta para o Chatwoot ANTES de disparar.
  // Sem isso a 1ª mensagem sai, mas a resposta do devedor não volta (não chega ao bot-turno).
  // Best-effort: não trava o envio, mas avisa se não conseguiu wirar a entrada.
  let webhook_aviso: string | undefined;
  const { data: cred } = await supabaseAdmin()
    .from("chips_credenciais")
    .select("zapi_instance_id, zapi_token, zapi_client_token")
    .eq("chip_id", chip_id)
    .maybeSingle();
  const clientToken = cred?.zapi_client_token?.trim() || process.env.ZAPI_CLIENT_TOKEN?.trim();
  if (cred?.zapi_instance_id && cred?.zapi_token && clientToken) {
    const wh = await garantirWebhookEntrada({
      chipId: chip_id, instanceId: cred.zapi_instance_id, token: cred.zapi_token, clientToken,
    });
    if (!wh.ok) webhook_aviso = `A mensagem foi enviada, mas não consegui garantir o caminho de volta (webhook de entrada): ${wh.mensagem ?? "falha desconhecida"}. As respostas podem não acionar o bot.`;
  } else {
    webhook_aviso = "Chip sem credenciais Z-API completas — não dá para garantir o caminho de volta das respostas.";
  }

  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/disparar-teste`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chip_id, numero_e164 }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d?.ok) {
    return NextResponse.json({ erro: d?.detalhe ?? d?.erro ?? "Falha ao disparar o teste." }, { status: 400 });
  }
  return NextResponse.json({ ...d, webhook_aviso });
}
