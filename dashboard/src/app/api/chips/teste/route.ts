import { NextResponse } from "next/server";
import { exigirCobrador, podeEditarChip, erroDono } from "@/lib/auth";

// Dispara a mensagem de teste para o número de teste (configurado na tela de Chips),
// usando o chip escolhido. Chama a Edge Function disparar-teste com o service role.
// O caminho de volta (resposta do contato → bot) é o webhook que a Meta entrega ao
// Chatwoot — configurado uma vez no app da Meta, no cadastro do número.
export async function POST(req: Request) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;

  const { chip_id, numero_e164 } = await req.json();
  if (!chip_id) return NextResponse.json({ erro: "chip_obrigatorio" }, { status: 400 });
  if (!(await podeEditarChip(g.sessao, Number(chip_id)))) return erroDono();

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
  return NextResponse.json(d);
}
