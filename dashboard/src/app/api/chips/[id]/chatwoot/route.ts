import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarChip, erroDono } from "@/lib/auth";
import { vincularChatwootInbox, sincronizarProviderConfig } from "@/lib/chatwoot";

// (Re)vincula o inbox do Chatwoot a um chip já cadastrado. Usado quando a criação
// automática falhou (ex.: chip antigo sem chatwoot_inbox_id) ou para reconectar.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarChip(g.sessao, Number(id)))) return erroDono();

  const forcar = await req.json().then((b) => !!b?.forcar).catch(() => false);

  const admin = supabaseAdmin();
  const { data: chip } = await admin.from("chips").select("id, nome").eq("id", Number(id)).maybeSingle();
  if (!chip) return NextResponse.json({ erro: "chip_nao_encontrado" }, { status: 404 });
  const { data: cred } = await admin
    .from("chips_credenciais").select("zapi_instance_id, zapi_token, zapi_client_token").eq("chip_id", Number(id)).maybeSingle();
  if (!cred) return NextResponse.json({ erro: "chip_sem_credencial" }, { status: 404 });

  const cw = await vincularChatwootInbox({
    chipId: chip.id, nome: chip.nome,
    instanceId: cred.zapi_instance_id, token: cred.zapi_token, clientToken: cred.zapi_client_token ?? undefined, forcar,
  });

  if (!cw.ok) return NextResponse.json({ ok: false, motivo: cw.motivo, erro: cw.mensagem }, { status: 502 });

  // Garante que o canal tenha as credenciais atuais (sobretudo o Token de Segurança/client_token):
  // sem isso a Z-API recusa o ENVIO de saída ("Falha ao enviar") mesmo com a instância conectada.
  const sync = await sincronizarProviderConfig({
    inboxId: cw.inbox_id, instanceId: cred.zapi_instance_id, token: cred.zapi_token,
    clientToken: cred.zapi_client_token ?? undefined,
  });

  return NextResponse.json({
    ok: true, inbox_id: cw.inbox_id, ja_existia: cw.ja_existia ?? false,
    provider_config_sincronizado: sync.ok, aviso_envio: sync.ok ? undefined : sync.mensagem,
  });
}
