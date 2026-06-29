import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarChip, erroDono } from "@/lib/auth";
import { verificarNumero } from "@/lib/meta";

// Força a atualização da saúde (qualidade/limite/status) de um chip Meta, lendo a Graph API.
// É o botão "Atualizar saúde" do card. O monitoramento contínuo é o chips-monitor (15 min).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarChip(g.sessao, Number(id)))) return erroDono();

  const admin = supabaseAdmin();
  const { data: cred } = await admin
    .from("chips_credenciais_meta").select("phone_number_id, access_token").eq("chip_id", Number(id)).maybeSingle();
  if (!cred) return NextResponse.json({ erro: "Este chip não usa o conector Meta." }, { status: 400 });

  const v = await verificarNumero({ phoneNumberId: cred.phone_number_id, token: cred.access_token });
  if (!v.ok) return NextResponse.json({ erro: v.mensagem, motivo: v.motivo }, { status: 400 });

  // mensagens iniciadas hoje (para "usado vs teto" do tier)
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: met } = await admin
    .from("chip_metricas_diarias").select("novos_contatos").eq("chip_id", Number(id)).eq("dia", hoje).maybeSingle();

  const saude = { ...v.saude, msgs_hoje: met?.novos_contatos ?? 0, atualizado_em: new Date().toISOString() };
  await admin.from("chips").update({ saude, numero_e164: v.saude.numero ?? undefined }).eq("id", Number(id));

  return NextResponse.json({ ok: true, saude });
}
