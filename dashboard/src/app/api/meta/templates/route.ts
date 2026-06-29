import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirEscopoConta, type Escopo } from "@/lib/auth";
import { listarTemplates, criarTemplate, excluirTemplate } from "@/lib/meta";

// Resolve os pares (waba_id, token) que o escopo pode gerir — lidos das credenciais Meta dos
// chips do cobrador (ou de todos, se admin global). O token fica só no servidor (service_role).
async function wabasDoEscopo(escopo: Escopo): Promise<{ waba_id: string; token: string; cobrador_id: string }[]> {
  const admin = supabaseAdmin();
  let q = admin.from("chips").select("id, cobrador_id, chips_credenciais_meta(waba_id, access_token)").eq("conector", "meta_cloud");
  if (!escopo.ehGlobal && escopo.cobradorId) q = q.eq("cobrador_id", escopo.cobradorId);
  const { data } = await q;
  const mapa = new Map<string, { waba_id: string; token: string; cobrador_id: string }>();
  for (const chip of (data ?? []) as any[]) {
    const cred = Array.isArray(chip.chips_credenciais_meta) ? chip.chips_credenciais_meta[0] : chip.chips_credenciais_meta;
    if (cred?.waba_id && cred?.access_token) {
      mapa.set(cred.waba_id, { waba_id: cred.waba_id, token: cred.access_token, cobrador_id: chip.cobrador_id });
    }
  }
  return [...mapa.values()];
}

// GET — lista os templates ao vivo (status de aprovação) das WABAs do escopo + atualiza o cache.
export async function GET(req: Request) {
  const conta = new URL(req.url).searchParams.get("conta");
  const g = await exigirEscopoConta(conta);
  if (g.erro) return g.erro;
  const wabas = await wabasDoEscopo(g.escopo);
  if (wabas.length === 0) return NextResponse.json({ ok: true, templates: [], wabas: [] });

  const admin = supabaseAdmin();
  const out: any[] = [];
  for (const w of wabas) {
    const r = await listarTemplates({ wabaId: w.waba_id, token: w.token });
    if (!r.ok) { out.push({ waba_id: w.waba_id, erro: r.mensagem }); continue; }
    for (const t of r.templates) {
      out.push({ ...t, waba_id: w.waba_id });
      // upsert no cache local (chave única cobrador+waba+name+language)
      await admin.from("meta_templates").upsert({
        cobrador_id: w.cobrador_id, waba_id: w.waba_id, meta_template_id: t.id ?? null,
        name: t.name, language: t.language, category: t.category, status: t.status,
        components: t.components ?? null, rejection_reason: t.rejected_reason ?? null,
        quality_score: t.quality_score ?? null, sincronizado_em: new Date().toISOString(),
      }, { onConflict: "cobrador_id,waba_id,name,language" });
    }
  }
  return NextResponse.json({ ok: true, templates: out, wabas: wabas.map((w) => w.waba_id) });
}

// POST — cria e submete um template à Meta. body: { waba_id?, name, category, language, components }
export async function POST(req: Request) {
  const body = await req.json();
  const g = await exigirEscopoConta(body.conta);
  if (g.erro) return g.erro;
  const wabas = await wabasDoEscopo(g.escopo);
  const alvo = body.waba_id ? wabas.find((w) => w.waba_id === body.waba_id) : wabas[0];
  if (!alvo) return NextResponse.json({ erro: "Nenhuma conta WhatsApp (WABA) Meta encontrada neste escopo." }, { status: 400 });

  const name = String(body.name ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const category = ["MARKETING", "UTILITY", "AUTHENTICATION"].includes(body.category) ? body.category : "UTILITY";
  const language = String(body.language ?? "pt_BR");
  const components = Array.isArray(body.components) ? body.components : [];
  if (!name || components.length === 0) return NextResponse.json({ erro: "Informe nome e corpo do template." }, { status: 400 });

  const r = await criarTemplate({ wabaId: alvo.waba_id, token: alvo.token, body: { name, category, language, components } });
  if (!r.ok) return NextResponse.json({ erro: r.mensagem, motivo: r.motivo }, { status: 400 });

  await supabaseAdmin().from("meta_templates").upsert({
    cobrador_id: alvo.cobrador_id, waba_id: alvo.waba_id, meta_template_id: r.id,
    name, language, category, status: r.status, components, sincronizado_em: new Date().toISOString(),
  }, { onConflict: "cobrador_id,waba_id,name,language" });

  return NextResponse.json({ ok: true, id: r.id, status: r.status });
}

// DELETE — remove um template. ?name=&waba_id=
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? "";
  const wabaId = url.searchParams.get("waba_id") ?? "";
  const g = await exigirEscopoConta(url.searchParams.get("conta"));
  if (g.erro) return g.erro;
  const wabas = await wabasDoEscopo(g.escopo);
  const alvo = wabaId ? wabas.find((w) => w.waba_id === wabaId) : wabas[0];
  if (!alvo || !name) return NextResponse.json({ erro: "Template ou WABA não encontrado." }, { status: 400 });

  const r = await excluirTemplate({ wabaId: alvo.waba_id, token: alvo.token, name });
  if (!r.ok) return NextResponse.json({ erro: r.mensagem }, { status: 400 });
  await supabaseAdmin().from("meta_templates").delete().eq("cobrador_id", alvo.cobrador_id).eq("waba_id", alvo.waba_id).eq("name", name);
  return NextResponse.json({ ok: true });
}
