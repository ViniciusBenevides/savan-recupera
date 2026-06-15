import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

// Proxy server-side do QR code Z-API — o token nunca chega ao navegador.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: cred } = await admin
    .from("chips_credenciais")
    .select("zapi_instance_id, zapi_token")
    .eq("chip_id", Number(id))
    .maybeSingle();
  if (!cred) return NextResponse.json({ erro: "chip_sem_credencial" }, { status: 404 });

  const base = `https://api.z-api.io/instances/${cred.zapi_instance_id}/token/${cred.zapi_token}`;
  const headers = { "Client-Token": process.env.ZAPI_CLIENT_TOKEN! };

  try {
    // primeiro checa status — se já conectado, não precisa de QR
    const st = await fetch(`${base}/status`, { headers });
    const status = await st.json();
    if (status?.connected) {
      await admin.from("chips").update({
        status: "conectado",
        numero_e164: status?.phone ? `+${status.phone}` : null,
        saude: status,
      }).eq("id", Number(id));
      return NextResponse.json({ conectado: true });
    }
    // QR em base64
    const qr = await fetch(`${base}/qr-code/image`, { headers });
    const qd = await qr.json();
    return NextResponse.json({ conectado: false, qr: qd?.value ?? null });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 502 });
  }
}
