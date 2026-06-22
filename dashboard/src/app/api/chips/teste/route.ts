import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Dispara a mensagem de teste para o número de teste (configurado na tela de Chips),
// usando o chip escolhido. Chama a Edge Function disparar-teste com o service role.
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user.id).maybeSingle();
  if (!perfil || !["admin", "operador"].includes(perfil.role)) {
    return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });
  }

  const { chip_id, numero_e164 } = await req.json();
  if (!chip_id) return NextResponse.json({ erro: "chip_obrigatorio" }, { status: 400 });

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
