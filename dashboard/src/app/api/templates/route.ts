import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirEscopoConta, type Escopo } from "@/lib/auth";

const TIPOS_VALIDOS = [
  "abordagem_inicial", "followup_1", "followup_2", "followup_3",
  "proposta", "pix", "confirmacao_pagamento", "quitacao",
];

// Confere que o template `id` pertence ao escopo (admin global = linhas globais;
// admin mirando um cobrador / cobrador = as linhas daquele cobrador).
async function donoConfere(id: number, escopo: Escopo): Promise<boolean> {
  const { data } = await supabaseAdmin().from("templates_mensagem").select("cobrador_id").eq("id", id).maybeSingle();
  if (!data) return false;
  return (data.cobrador_id ?? null) === escopo.cobradorId;
}

// CRUD de templates escopado por conta. Escritas via service role; autorização nos guards.
// body.acao: criar | atualizar | excluir | clonar_padrao   (+ body.conta p/ admin mirar um cobrador)
export async function POST(req: Request) {
  const body = await req.json();
  const g = await exigirEscopoConta(body.conta);
  if (g.erro) return g.erro;
  const { escopo } = g;
  const admin = supabaseAdmin();

  if (body.acao === "criar") {
    const t = body.template ?? {};
    if (!TIPOS_VALIDOS.includes(t.tipo)) return NextResponse.json({ erro: "tipo_invalido" }, { status: 400 });
    const { error } = await admin.from("templates_mensagem").insert({
      nome: t.nome ?? "Novo modelo", tipo: t.tipo, conteudo: t.conteudo ?? "",
      peso: t.peso ?? 1, ativo: t.ativo ?? true, cobrador_id: escopo.cobradorId,
    });
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.acao === "atualizar") {
    if (!(await donoConfere(body.id, escopo))) return NextResponse.json({ erro: "sem_permissao_neste_recurso" }, { status: 403 });
    const p = body.patch ?? {};
    const { error } = await admin.from("templates_mensagem").update({
      nome: p.nome, conteudo: p.conteudo, peso: p.peso, ativo: p.ativo,
      atualizado_em: new Date().toISOString(),
    }).eq("id", body.id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.acao === "excluir") {
    if (!(await donoConfere(body.id, escopo))) return NextResponse.json({ erro: "sem_permissao_neste_recurso" }, { status: 403 });
    const { error } = await admin.from("templates_mensagem").delete().eq("id", body.id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // Clona os modelos padrão (globais) para a conta — ponto de partida quando o cobrador ainda
  // não tem os seus. No-op no escopo global. Não duplica os tipos que o cobrador já tiver.
  if (body.acao === "clonar_padrao") {
    if (!escopo.cobradorId) return NextResponse.json({ erro: "ja_e_global" }, { status: 400 });
    const { data: globais } = await admin.from("templates_mensagem")
      .select("nome, tipo, conteudo, ativo, peso").is("cobrador_id", null);
    const { data: meus } = await admin.from("templates_mensagem")
      .select("tipo").eq("cobrador_id", escopo.cobradorId);
    const jaTenho = new Set((meus ?? []).map((t) => t.tipo));
    const novos = (globais ?? []).map((t) => ({ ...t, cobrador_id: escopo.cobradorId }));
    if (novos.length === 0) return NextResponse.json({ ok: true, clonados: 0 });
    const { error } = await admin.from("templates_mensagem").insert(novos);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, clonados: novos.length, ja_tinha: [...jaTenho] });
  }

  return NextResponse.json({ erro: "acao_invalida" }, { status: 400 });
}
