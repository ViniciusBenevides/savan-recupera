import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";
import { criarInboxMeta } from "@/lib/chatwoot";
import { verificarNumero, subscribarWaba } from "@/lib/meta";
import { configurarWebhookDoChip } from "@/lib/meta-webhook";
import { normalizarTelefone } from "@/lib/import/normalizar";

// Cria chip + credenciais + (best-effort) inbox no Chatwoot. Dois caminhos:
//  - chip de bot: API oficial da Meta (cola phone_number_id + WABA + token permanente);
//  - escalador humano "só registrado": papel=equipe SEM credenciais (só nome + número), sem
//    Chatwoot — o bot avisa esse número na escalação.
export async function POST(req: Request) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const { sessao } = g;

  const body = await req.json();
  const { nome, maturidade, limite_dia_override, limite_hora_override, papel, agente_nome, cobrador_id, numero_e164 } = body;
  if (!nome) return NextResponse.json({ erro: "campos_obrigatorios" }, { status: 400 });

  const admin = supabaseAdmin();
  // dono do chip: cobrador => ele mesmo; admin => o cobrador alvo informado, senão ele mesmo
  const dono = sessao.role === "cobrador"
    ? sessao.user.id
    : (typeof cobrador_id === "string" && cobrador_id ? cobrador_id : sessao.user.id);

  // ── Escalador humano (só registrado) ──────────────────────────────────────────────────
  if (papel === "equipe") {
    const n = normalizarTelefone(numero_e164, "movel");
    if (!n) return NextResponse.json({ erro: "Informe um número de WhatsApp válido, com DDD." }, { status: 400 });

    const novo: Record<string, unknown> = {
      nome, status: "cadastrado", cobrador_id: dono, papel: "equipe", numero_e164: n.e164,
    };
    if (typeof agente_nome === "string" && agente_nome.trim()) novo.agente_nome = agente_nome.trim();

    const { data: chip, error } = await admin.from("chips").insert(novo).select("id").single();
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, chip_id: chip.id, escalador: true, chatwoot: null });
  }

  // ── Chip de bot: número oficial na Meta Cloud API ─────────────────────────────────────
  const phoneNumberId = String(body.meta_phone_number_id ?? "").trim();
  const wabaId = String(body.meta_waba_id ?? "").trim();
  const metaToken = String(body.meta_token ?? "").trim();
  const appId = String(body.meta_app_id ?? "").trim() || null;
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
  if (limite_hora_override != null && limite_hora_override !== "") novoMeta.limite_hora_override = Number(limite_hora_override);

  const { data: chipM, error: errM } = await admin.from("chips").insert(novoMeta).select("id").single();
  if (errM) return NextResponse.json({ erro: errM.message }, { status: 400 });

  await admin.from("chips_credenciais_meta").insert({
    chip_id: chipM.id, phone_number_id: phoneNumberId, waba_id: wabaId, access_token: metaToken,
    app_id: appId, app_secret: appSecret,
  });

  // assina a WABA ao app (best-effort) e cria o inbox cloud no Chatwoot
  const sub = await subscribarWaba({ wabaId, token: metaToken });
  const cw = v.saude.numero
    ? await criarInboxMeta({ chipId: chipM.id, nome, phoneNumber: v.saude.numero, apiKey: metaToken, phoneNumberId, wabaId })
    : { ok: false as const, motivo: "falha" as const, mensagem: "Número não retornado pela Meta." };

  // e aponta o webhook do app da Meta para esse inbox — a etapa que antes era manual no painel.
  // Falha aqui não invalida o cadastro: a UI cai no plano B (colar URL/token à mão).
  const wh = await configurarWebhookDoChip({
    chipId: chipM.id, appId, appSecret,
    callbackUrl: cw.ok ? (cw as any).callback_url ?? null : null,
    verifyToken: cw.ok ? (cw as any).verify_token ?? null : null,
  });

  return NextResponse.json({
    ok: true, chip_id: chipM.id, numero: v.saude.numero, saude: v.saude,
    waba_assinada: sub.ok,
    chatwoot: cw.ok ? { ok: true } : { ok: false, mensagem: cw.mensagem },
    callback_url: wh.callback_url,
    verify_token: wh.verify_token,
    webhook: { ok: wh.ok, motivo: wh.motivo, mensagem: wh.mensagem },
  });
}
