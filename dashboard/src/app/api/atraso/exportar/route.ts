import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { COLUNAS_ATRASO, filtrarAtraso, lerFiltros, ordenarAtraso } from "@/lib/atraso";
import { FAIXAS, faixaDoVencimento, tempoEmAtraso, triagem } from "@/lib/recuperacao";
import { ROTULO_SITUACAO } from "@/lib/resultados";

export const runtime = "nodejs";
export const maxDuration = 30;

type Linha = {
  id: number; nome: string; cpf_cnpj: string; processo: string | null; saldo: number; vencimento: string | null; prescricao_em: string | null;
  status_cobranca: string; carteiras: { nome: string } | null;
};

// CSV para o Excel em português: ponto e vírgula, BOM no começo e vírgula decimal.
const celula = (v: unknown) => {
  const s = String(v ?? "").replace(/[\r\n]+/g, " ").trim();
  return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/**
 * GET — a planilha de Atraso / prescrição com os mesmos filtros da tela (carteira, busca, faixa e
 * ordem). Lê com a sessão de quem pede: cada um baixa só as carteiras que enxerga.
 */
export async function GET(req: Request) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const p = new URL(req.url).searchParams;
  const f = lerFiltros({ carteira: p.get("carteira"), q: p.get("q"), faixa: p.get("faixa"), ordem: p.get("ordem") });
  const sb = await supabaseServer();
  const hoje = new Date();

  // O PostgREST devolve no máximo 1.000 linhas por vez
  const linhas: Linha[] = [];
  for (let ini = 0; ini < 50_000; ini += 1000) {
    const { data, error } = await ordenarAtraso(filtrarAtraso(sb.from("devedores").select(COLUNAS_ATRASO), f, f.faixa, hoje), f.ordem).range(ini, ini + 999);
    if (error) return NextResponse.json({ erro: "Não foi possível montar a planilha. Tente de novo." }, { status: 500 });
    linhas.push(...((data ?? []) as unknown as Linha[]));
    if (!data || data.length < 1000) break;
  }

  const rotuloFaixa = new Map(FAIXAS.map((x) => [x.k, x.t]));
  const cabecalho = ["Carteira", "Processo", "Cliente", "CPF/CNPJ", "Saldo", "Vencimento", "Dias em atraso", "Tempo em atraso", "Faixa",
    "Prazo conferido", "Triagem", "Situação"];
  const corpo = linhas.map((l) => {
    const atraso = tempoEmAtraso(l.vencimento, hoje);
    const faixa = faixaDoVencimento(l.vencimento, hoje);
    return [
      l.carteiras?.nome, l.processo, l.nome, l.cpf_cnpj, Number(l.saldo).toFixed(2).replace(".", ","), dataBR(l.vencimento), l.vencimento ? atraso.dias : "",
      atraso.texto, rotuloFaixa.get(faixa), dataBR(l.prescricao_em), triagem(faixa, l.prescricao_em, hoje).texto, ROTULO_SITUACAO[l.status_cobranca] ?? l.status_cobranca,
    ].map(celula).join(";");
  });
  const csv = "﻿" + [cabecalho.join(";"), ...corpo].join("\r\n");

  await registrarAuditoria(supabaseAdmin(), g.sessao, {
    acao: "planilha_atraso", entidade: "carteira", entidade_id: f.carteira, carteira_id: f.carteira, detalhe: { linhas: linhas.length, faixa: f.faixa, busca: !!f.q },
  });
  const dia = hoje.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ATRASO_${f.faixa === "todas" ? "TODOS" : f.faixa.toUpperCase()}_${dia}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
