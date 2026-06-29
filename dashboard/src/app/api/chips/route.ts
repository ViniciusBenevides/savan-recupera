import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";
import { vincularChatwootInbox, criarInboxMeta } from "@/lib/chatwoot";
import { verificarNumero, subscribarWaba } from "@/lib/meta";
import { normalizarTelefone } from "@/lib/import/normalizar";

// Cria chip + credenciais + (best-effort) inbox no Chatwoot. Três caminhos:
//  - conector "meta_cloud": API oficial da Meta (cola phone_number_id+WABA+token, sem QR);
//  - conector "zapi" (padrão): credenciais Z-API + QR;
//  - escalador humano "só registrado": papel=equipe SEM credenciais (só nome + número), sem
//    QR nem Chatwoot — o bot avisa esse número na escalação.
export async function POST(req: Request) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const { sessao } = g;

  const body = await req.json();
  const { nome, instance_id, token, client_token, maturidade, aquecimento_perfil, limite_dia_override, papel, agente_nome, tipo, cobrador_id, numero_e164 } = body;
  const conector = body.conector === "meta_cloud" ? "meta_cloud" : "zapi";
  if (!nome) return NextResponse.json({ erro: "campos_obrigatorios" }, { status: 400 });

  const admin = supabaseAdmin();
  // dono do chip: cobrador => ele mesmo; admin => o cobrador alvo informado, senão ele mesmo
  const dono = sessao.role === "cobrador"
    ? sessao.user.id
    : (typeof cobrador_id === "string" && cobrador_id ? cobrador_id : sessao.user.id);

  // ── Conector Meta Cloud API (oficial) ─────────────────────────────────────────────────
  if (conector === "meta_cloud" && papel !== "equipe") {
    const phoneNumberId = String(body.meta_phone_number_id ?? "").trim();
    const wabaId = String(body.meta_waba_id ?? "").trim();
    const metaToken = String(body.meta_token ?? "").trim();
    const appSecret = String(body.meta_app_secret ?? "").trim() || null;
    if (!phoneNumberId || !wabaId || !metaToken) {
      return NextResponse.json({ erro: "Informe phone_number_id, WABA id e o token de acesso da Meta." }, { status: 400 });
    }
    // valida as credenciais e descobre o número real + saúde
    const v = await verificarNumero({ phoneNumberId, token: metaToken });
    if (!v.ok) return NextResponse.json({ erro: v.mensagem, motivo: v.motivo }, { status: 400 });

    const novoMeta: Record<string, unknown> = {
      nome, status: "conectado", cobrador_id: dono, papel: "bot", conector: "meta_cloud",
      numero_e164: v.saude.numero, tipo: "virtual_api",
      saude: { ...v.saude, msgs_hoje: 0, atualizado_em: new Date().toISOString() },
    };
    if (maturidade === "aquecido" || maturidade === "novo") novoMeta.maturidade = maturidade;
    if (limite_dia_override != null && limite_dia_override !== "") novoMeta.limite_dia_override = Number(limite_dia_override);

    const { data: chipM, error: errM } = await admin.from("chips").insert(novoMeta).select("id").single();
    if (errM) return NextResponse.json({ erro: errM.message }, { status: 400 });

    await admin.from("chips_credenciais_meta").insert({
      chip_id: chipM.id, phone_number_id: phoneNumberId, waba_id: wabaId, access_token: metaToken, app_secret: appSecret,
    });

    // assina a WABA ao app (best-effort) e cria o inbox cloud no Chatwoot
    const sub = await subscribarWaba({ wabaId, token: metaToken });
    const cw = v.saude.numero
      ? await criarInboxMeta({ chipId: chipM.id, nome, phoneNumber: v.saude.numero, apiKey: metaToken, phoneNumberId, wabaId })
      : { ok: false as const, motivo: "falha" as const, mensagem: "Número não retornado pela Meta." };

    return NextResponse.json({
      ok: true, chip_id: chipM.id, conector: "meta_cloud", numero: v.saude.numero, saude: v.saude,
      waba_assinada: sub.ok,
      chatwoot: cw.ok ? { ok: true } : { ok: false, mensagem: cw.mensagem },
      callback_url: cw.ok ? (cw as any).callback_url : null,
      verify_token: cw.ok ? (cw as any).verify_token : null,
    });
  }

  // ── Conector Z-API / escalador manual ─────────────────────────────────────────────────
  const temCreds = !!(instance_id && token && client_token);
  const escaladorManual = papel === "equipe" && !temCreds;
  // chip de bot (ou escalador via Z-API) precisa das credenciais
  if (!escaladorManual && !temCreds) {
    return NextResponse.json({ erro: "campos_obrigatorios" }, { status: 400 });
  }

  let numeroNorm: string | null = null;
  if (escaladorManual) {
    const n = normalizarTelefone(numero_e164, "movel");
    if (!n) return NextResponse.json({ erro: "Informe um número de WhatsApp válido, com DDD." }, { status: 400 });
    numeroNorm = n.e164;
  }

  const novo: Record<string, unknown> = { nome, status: "cadastrado", cobrador_id: dono };
  if (papel === "bot" || papel === "equipe") novo.papel = papel;
  if (typeof agente_nome === "string" && agente_nome.trim()) novo.agente_nome = agente_nome.trim();

  if (escaladorManual) {
    // sem Z-API: só nome + número. Tipo/maturidade não se aplicam a um humano que só recebe.
    novo.numero_e164 = numeroNorm;
  } else {
    if (["fisico", "esim", "voip", "virtual_api"].includes(tipo)) novo.tipo = tipo;
    if (maturidade === "aquecido" || maturidade === "novo") novo.maturidade = maturidade;
    if (typeof aquecimento_perfil === "string" && aquecimento_perfil.trim()) novo.aquecimento_perfil = aquecimento_perfil.trim();
    if (limite_dia_override != null && limite_dia_override !== "") novo.limite_dia_override = Number(limite_dia_override);
  }

  const { data: chip, error } = await admin
    .from("chips")
    .insert(novo)
    .select("id")
    .single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  // escalador só registrado: nada de credenciais nem Chatwoot
  if (escaladorManual) {
    return NextResponse.json({ ok: true, chip_id: chip.id, sem_zapi: true, chatwoot: null });
  }

  await admin.from("chips_credenciais").insert({
    chip_id: chip.id, zapi_instance_id: instance_id, zapi_token: token, zapi_client_token: client_token,
  });

  // cria o inbox no Chatwoot (canal Z-API) já vinculando o token de segurança.
  // O resultado vai no retorno para o front avisar se ficou ou não linkado.
  const cw = await vincularChatwootInbox({ chipId: chip.id, nome, instanceId: instance_id, token, clientToken: client_token });

  return NextResponse.json({
    ok: true,
    chip_id: chip.id,
    inbox_id: cw.ok ? cw.inbox_id : null,
    chatwoot: cw.ok ? { ok: true } : { ok: false, motivo: cw.motivo, mensagem: cw.mensagem },
  });
}
