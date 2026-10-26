import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { carteiraDoJuridico } from "@/lib/juridico/acesso";
import { fontesFrescas, sincronizarFontes } from "@/lib/juridico/servico";
import { chavesDasFontes, type Fundamento } from "@/lib/juridico/motor";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST — body: { acao: "aprovar" | "criar_caso" }
 * aprovar: o advogado assina a análise. Só passa se toda lei usada na fundamentação foi confirmada
 *   na fonte oficial hoje; a aprovação guarda quem, quando e o estado das fontes naquele momento.
 * criar_caso: a análise aprovada vira caso na etapa Ajuizamento. Nada é protocolado no tribunal.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const id = Number((await params).id);
  const b = await req.json().catch(() => ({}));
  const adm = supabaseAdmin();
  const { data: a } = await adm.from("juridico_analises").select("id, devedor_id, carteira_id, status, medida, confianca, saldo, fundamentos, fontes_status").eq("id", id).maybeSingle();
  if (!a) return NextResponse.json({ erro: "Análise não encontrada." }, { status: 404 });
  const cart = await carteiraDoJuridico(g.sessao, a.devedor_id);
  if (!cart) return NextResponse.json({ erro: "Você não pode decidir o Jurídico deste devedor." }, { status: 403 });

  if (b?.acao === "aprovar") {
    if (a.status === "APROVADA") return NextResponse.json({ erro: "Esta análise já foi aprovada." }, { status: 409 });
    const chaves = chavesDasFontes((a.fundamentos ?? []) as Fundamento[]);
    await sincronizarFontes(adm, { chaves });
    const frescas = await fontesFrescas(adm, chaves);
    if (!frescas.ok) {
      const faltam = frescas.estado.filter((e) => !e.fresca).map((e) => e.nome);
      return NextResponse.json({ erro: `Não dá para aprovar: estas fontes oficiais não foram confirmadas hoje — ${faltam.join("; ")}. Sincronize e tente de novo.` }, { status: 409 });
    }
    const agora = new Date().toISOString();
    const { error } = await adm.from("juridico_analises").update({
      status: "APROVADA", aprovado_por: g.sessao.user.id, aprovado_por_nome: g.sessao.nome, aprovado_em: agora,
      fontes_status: "FONTES OFICIAIS VERIFICADAS NA APROVAÇÃO", fontes_verificadas_em: agora, fontes: frescas.estado,
    }).eq("id", id).eq("status", "RASCUNHO");
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    await registrarAuditoria(adm, g.sessao, { acao: "juridico_analise_aprovada", entidade: "juridico_analise", entidade_id: id, carteira_id: a.carteira_id, devedor_id: a.devedor_id, detalhe: { medida: a.medida } });
    return NextResponse.json({ ok: true });
  }

  if (b?.acao === "criar_caso") {
    if (a.status !== "APROVADA") return NextResponse.json({ erro: "A análise precisa ser aprovada pelo advogado antes de virar caso." }, { status: 409 });
    const { data: existe } = await adm.from("juridico_casos").select("id").eq("analise_id", id).maybeSingle();
    if (existe) return NextResponse.json({ erro: "Esta análise já virou caso jurídico." }, { status: 409 });
    const { data: caso, error } = await adm.from("juridico_casos").insert({
      devedor_id: a.devedor_id, carteira_id: a.carteira_id, analise_id: id, etapa: "Ajuizamento",
      prioridade: a.confianca >= 75 ? "Alta" : "Média", acao: a.medida, valor_causa: a.saldo, responsavel: g.sessao.nome,
      proxima_acao: "Revisar minuta, documentos e preparar protocolo", status: "Preparação", criado_por: g.sessao.user.id,
      observacao: `Gerado a partir da análise jurídica #${id}. Confiança ${a.confianca}%. O protocolo depende da conferência final do advogado.`,
    }).select("id").single();
    if (error) return NextResponse.json({ erro: error.code === "23505" ? "Esta análise já virou caso jurídico." : error.message }, { status: 400 });
    // Fica no histórico da ficha, junto com os contatos
    await adm.from("ocorrencias").insert({
      devedor_id: a.devedor_id, carteira_id: a.carteira_id, autor_id: g.sessao.user.id, autor_nome: g.sessao.nome,
      canal: "sistema", resultado: "anotacao", descricao: `Encaminhado ao Jurídico: ${a.medida} (caso #${caso.id}).`,
    });
    await registrarAuditoria(adm, g.sessao, { acao: "juridico_caso_criado", entidade: "juridico_caso", entidade_id: caso.id, carteira_id: a.carteira_id, devedor_id: a.devedor_id, detalhe: { analise: id, acao: a.medida } });
    return NextResponse.json({ ok: true, caso_id: caso.id });
  }

  return NextResponse.json({ erro: "Ação desconhecida." }, { status: 400 });
}
