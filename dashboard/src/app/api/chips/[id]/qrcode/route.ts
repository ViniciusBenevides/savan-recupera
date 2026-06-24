import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarChip, erroDono } from "@/lib/auth";
import { finalizarConexaoChip } from "@/lib/zapi";

// Extrai uma mensagem legível de um corpo de resposta da Z-API.
function textoErro(body: any): string {
  if (!body) return "";
  if (typeof body === "string") return body;
  return [body.error, body.message, body.value, body.description]
    .filter((v) => typeof v === "string" && v.trim())
    .join(" ");
}

// Detecta se o erro é de assinatura/pagamento da instância (expirada, pendente,
// cancelada) — caso em que a Z-API não gera QR até quitar.
const RE_ASSINATURA =
  /\b(pay|paid|payment|subscri\w*|billing|overdue|expired?|trial|inactive|deactivat\w*|due|unpaid|suspend\w*)\b|pagament\w*|assinatura|vencid\w*|pague|renov\w*|expirad\w*|cancelad\w*|plano|fatura|suspens\w*/i;
function ehAssinatura(httpStatus: number, txt: string): boolean {
  return httpStatus === 402 || RE_ASSINATURA.test(txt);
}

// Proxy server-side do QR code Z-API — o token nunca chega ao navegador.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarChip(g.sessao, Number(id)))) return erroDono();

  const admin = supabaseAdmin();
  const { data: chip } = await admin
    .from("chips").select("numero_e164, chatwoot_inbox_id, saude").eq("id", Number(id)).maybeSingle();
  const chatwootVinculado = !!chip?.chatwoot_inbox_id;

  const { data: cred } = await admin
    .from("chips_credenciais")
    .select("zapi_instance_id, zapi_token, zapi_client_token")
    .eq("chip_id", Number(id))
    .maybeSingle();
  if (!cred) {
    return NextResponse.json(
      { conectado: false, qr: null, motivo: "credencial", erro: "Chip sem credenciais Z-API.", chatwoot_vinculado: chatwootVinculado },
      { status: 404 },
    );
  }

  const clientToken = cred.zapi_client_token?.trim() || process.env.ZAPI_CLIENT_TOKEN?.trim();
  if (!clientToken) {
    return NextResponse.json({
      conectado: false, qr: null, motivo: "config", chatwoot_vinculado: chatwootVinculado,
      erro: "Token de segurança da Z-API não informado neste chip. Edite o chip e preencha o Token de Segurança (aba Segurança no painel da Z-API). Sem ele a instância não conecta e o Chatwoot não fica linkado.",
    });
  }

  const base = `https://api.z-api.io/instances/${cred.zapi_instance_id}/token/${cred.zapi_token}`;
  const headers = { "Client-Token": clientToken };

  async function reportarErro(httpStatus: number, body: any) {
    const txt = textoErro(body);
    const motivo = ehAssinatura(httpStatus, txt) ? "assinatura" : "indisponivel";
    const mensagem = txt || `Z-API respondeu ${httpStatus}.`;
    await admin.from("chips").update({
      saude: { motivo, mensagem, http_status: httpStatus, checado_em: new Date().toISOString() },
    }).eq("id", Number(id));
    return NextResponse.json({ conectado: false, qr: null, motivo, erro: mensagem, chatwoot_vinculado: chatwootVinculado });
  }

  try {
    // 1) status — se já conectado, não precisa de QR
    const st = await fetch(`${base}/status`, { headers });
    const status = await st.json().catch(() => ({}));
    if (status?.connected) {
      // finaliza uma vez: número real → inbox do Chatwoot + webhooks da Z-API
      const saude: any = chip?.saude;
      const jaFinalizado = !!chip?.numero_e164 && saude?.webhook_ok === true;
      const fin = jaFinalizado ? null : await finalizarConexaoChip({
        chipId: Number(id), instanceId: cred.zapi_instance_id, token: cred.zapi_token, clientToken,
      });
      return NextResponse.json({
        conectado: true,
        chatwoot_vinculado: fin ? fin.chatwoot_ok : chatwootVinculado,
        finalizacao: fin ?? {
          telefone: chip?.numero_e164 ?? null, telefone_ok: true, webhook_ok: true,
          chatwoot_ok: chatwootVinculado, inbox_id: chip?.chatwoot_inbox_id ?? null,
        },
      });
    }

    // problema claro de assinatura/HTTP já no status → para aqui (não fica girando)
    const statusTxt = textoErro(status);
    if (!st.ok || ehAssinatura(st.status, statusTxt)) {
      return await reportarErro(st.status, status);
    }

    // 2) QR em base64 (instância paga, aguardando leitura)
    const qr = await fetch(`${base}/qr-code/image`, { headers });
    const qd = await qr.json().catch(() => ({}));
    if (qd?.value) {
      return NextResponse.json({ conectado: false, qr: qd.value, chatwoot_vinculado: chatwootVinculado });
    }

    // sem QR e sem conexão → classifica (em geral assinatura pendente)
    return await reportarErro(qr.status, qd);
  } catch (e) {
    return NextResponse.json(
      { conectado: false, qr: null, motivo: "indisponivel", erro: String(e), chatwoot_vinculado: chatwootVinculado },
      { status: 502 },
    );
  }
}
