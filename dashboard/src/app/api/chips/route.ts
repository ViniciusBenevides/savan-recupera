import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

async function exigirOperador() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { erro: "nao_autenticado", status: 401 };
  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user.id).maybeSingle();
  if (!perfil || !["admin", "operador"].includes(perfil.role)) return { erro: "sem_permissao", status: 403 };
  return { user };
}

// Cria chip + credenciais Z-API + (best-effort) inbox no Chatwoot.
export async function POST(req: Request) {
  const guard = await exigirOperador();
  if ("erro" in guard) return NextResponse.json({ erro: guard.erro }, { status: guard.status });

  const { nome, instance_id, token } = await req.json();
  if (!nome || !instance_id || !token) {
    return NextResponse.json({ erro: "campos_obrigatorios" }, { status: 400 });
  }
  const admin = supabaseAdmin();

  const { data: chip, error } = await admin
    .from("chips")
    .insert({ nome, status: "cadastrado" })
    .select("id")
    .single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  await admin.from("chips_credenciais").insert({
    chip_id: chip.id, zapi_instance_id: instance_id, zapi_token: token,
  });

  // tenta criar inbox no Chatwoot (canal Z-API). Best-effort.
  let inboxId: number | null = null;
  try {
    const r = await fetch(`${process.env.CHATWOOT_URL}/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID}/inboxes`, {
      method: "POST",
      headers: { "api_access_token": process.env.CHATWOOT_TOKEN!, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `SAVAN ${nome}`,
        channel: {
          type: "whatsapp",
          provider: "zapi",
          phone_number: "+550000000000",
          provider_config: {
            instance_id,
            token,
            client_token: process.env.ZAPI_CLIENT_TOKEN,
          },
        },
      }),
    });
    if (r.ok) {
      const d = await r.json();
      inboxId = d?.id ?? d?.payload?.id ?? null;
      if (inboxId) await admin.from("chips").update({ chatwoot_inbox_id: inboxId }).eq("id", chip.id);
    }
  } catch { /* inbox manual depois */ }

  return NextResponse.json({ ok: true, chip_id: chip.id, inbox_id: inboxId });
}
