import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarChip, erroDono } from "@/lib/auth";
import { deletarInbox } from "@/lib/chatwoot";
import { normalizarTelefone } from "@/lib/import/normalizar";

// Devolve os dados do chip + credenciais da Meta para preencher o formulário de
// edição (admin ou cobrador dono). Os tokens chegam ao navegador apenas aqui, sob auth.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarChip(g.sessao, Number(id)))) return erroDono();

  const admin = supabaseAdmin();
  const [{ data: chip }, { data: credMeta }] = await Promise.all([
    admin.from("chips").select("nome, maturidade, aquecimento_perfil, limite_dia_override, limite_hora_override, papel, agente_nome, tipo, numero_e164, chatwoot_inbox_id, saude, conector, instancia_evolution, status").eq("id", Number(id)).maybeSingle(),
    admin.from("chips_credenciais_meta").select("phone_number_id, waba_id, access_token, app_id, app_secret, webhook_callback_url, webhook_configurado_em").eq("chip_id", Number(id)).maybeSingle(),
  ]);
  if (!chip) return NextResponse.json({ erro: "chip_nao_encontrado" }, { status: 404 });

  return NextResponse.json({
    nome: chip.nome,
    maturidade: chip.maturidade ?? "novo",
    aquecimento_perfil: chip.aquecimento_perfil ?? null,
    limite_dia_override: chip.limite_dia_override ?? null,
    limite_hora_override: chip.limite_hora_override ?? null,
    papel: chip.papel ?? "bot",
    agente_nome: chip.agente_nome ?? "",
    tipo: chip.tipo ?? "virtual_api",
    numero_e164: chip.numero_e164 ?? "",
    saude: chip.saude ?? null,
    // O conector decide o formulário inteiro: Baileys pede número e QR, Meta pede credenciais.
    conector: chip.conector ?? "baileys",
    instancia_evolution: chip.instancia_evolution ?? null,
    status: chip.status ?? "cadastrado",
    chatwoot_inbox_id: chip.chatwoot_inbox_id ?? null,
    // escalador "só registrado": papel=equipe, sem credenciais e sem inbox no Chatwoot
    escalador: (chip.papel ?? "bot") === "equipe" && !credMeta && !chip.chatwoot_inbox_id,
    // credenciais Meta (chegam ao navegador só aqui, sob auth — para preencher a edição)
    meta_phone_number_id: credMeta?.phone_number_id ?? "",
    meta_waba_id: credMeta?.waba_id ?? "",
    meta_token: credMeta?.access_token ?? "",
    meta_app_id: credMeta?.app_id ?? "",
    meta_app_secret: credMeta?.app_secret ?? "",
    // estado do webhook do app (o passo que o SAVAN configura sozinho quando tem app_id+secret)
    webhook_configurado_em: credMeta?.webhook_configurado_em ?? null,
    webhook_callback_url: credMeta?.webhook_callback_url ?? null,
  });
}

// Edita nome, ritmo e/ou credenciais da Meta do chip.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarChip(g.sessao, Number(id)))) return erroDono();

  const { nome, maturidade, aquecimento_perfil, limite_dia_override, limite_hora_override, papel, agente_nome, numero_e164,
    meta_phone_number_id, meta_waba_id, meta_token, meta_app_id, meta_app_secret } = await req.json();
  const admin = supabaseAdmin();

  const chipPatch: Record<string, unknown> = {};
  if (typeof nome === "string" && nome.trim()) chipPatch.nome = nome.trim();
  if (papel === "bot" || papel === "equipe") chipPatch.papel = papel;
  if (agente_nome !== undefined) chipPatch.agente_nome = (typeof agente_nome === "string" && agente_nome.trim()) ? agente_nome.trim() : null;
  // número do escalador "só registrado": editável à mão. Normaliza p/ E.164.
  if (typeof numero_e164 === "string" && numero_e164.trim()) {
    const n = normalizarTelefone(numero_e164, "movel");
    if (!n) return NextResponse.json({ erro: "Informe um número de WhatsApp válido, com DDD." }, { status: 400 });
    chipPatch.numero_e164 = n.e164;
  }
  if (maturidade === "aquecido" || maturidade === "novo") chipPatch.maturidade = maturidade;
  if (aquecimento_perfil !== undefined) chipPatch.aquecimento_perfil = aquecimento_perfil || null;
  if (limite_dia_override !== undefined) {
    chipPatch.limite_dia_override = limite_dia_override === null || limite_dia_override === "" ? null : Number(limite_dia_override);
  }
  // teto por HORA deste chip (§33) — em branco volta para a sugestão por maturidade (fn_limite_chip_hora)
  if (limite_hora_override !== undefined) {
    chipPatch.limite_hora_override = limite_hora_override === null || limite_hora_override === "" ? null : Number(limite_hora_override);
  }
  if (Object.keys(chipPatch).length > 0) {
    const { error } = await admin.from("chips").update(chipPatch).eq("id", Number(id));
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  }

  // credenciais Meta — atualiza só os campos enviados
  const patchMeta: Record<string, string | null> = {};
  if (typeof meta_phone_number_id === "string" && meta_phone_number_id.trim()) patchMeta.phone_number_id = meta_phone_number_id.trim();
  if (typeof meta_waba_id === "string" && meta_waba_id.trim()) patchMeta.waba_id = meta_waba_id.trim();
  if (typeof meta_token === "string" && meta_token.trim()) patchMeta.access_token = meta_token.trim();
  if (meta_app_id !== undefined) patchMeta.app_id = (typeof meta_app_id === "string" && meta_app_id.trim()) ? meta_app_id.trim() : null;
  if (meta_app_secret !== undefined) patchMeta.app_secret = (typeof meta_app_secret === "string" && meta_app_secret.trim()) ? meta_app_secret.trim() : null;
  if (Object.keys(patchMeta).length > 0) {
    patchMeta.atualizado_em = new Date().toISOString();
    const { error } = await admin.from("chips_credenciais_meta").update(patchMeta).eq("chip_id", Number(id));
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

// Exclui o chip (cascade nas credenciais/métricas; fila/conversas viram null) e
// remove o inbox vinculado no Chatwoot (best-effort).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarChip(g.sessao, Number(id)))) return erroDono();

  const admin = supabaseAdmin();
  const { data: chip } = await admin.from("chips").select("chatwoot_inbox_id").eq("id", Number(id)).maybeSingle();
  if (!chip) return NextResponse.json({ erro: "chip_nao_encontrado" }, { status: 404 });

  if (chip.chatwoot_inbox_id) await deletarInbox(chip.chatwoot_inbox_id);

  const { error } = await admin.from("chips").delete().eq("id", Number(id));
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
