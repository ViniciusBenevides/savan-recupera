import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarCarteira, erroDono } from "@/lib/auth";
import {
  descontoEfetivoPP, finalDoCpf, formatarBRL, formatarDataBR, formatarNomeCompleto,
} from "@/lib/mensagem-previa";

// Dois devedores reais desta carteira para a prévia do fluxo: um que recebe a oferta com desconto e
// um que cai no piso do Pix (e recebe a mensagem sem a frase do desconto). Ver com dados de verdade
// é o que ensina quem escreve o texto — o exemplo fictício nunca mostra o nome esquisito da planilha
// nem a frase que some para 7% da fila.
//
// A oferta sai da mesma `fn_proposta` que o campanha-lote chama, com o mesmo desconto efetivo.
const CANDIDATOS = 15;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const carteiraId = Number(id);
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  if (!(await podeEditarCarteira(g.sessao, carteiraId))) return erroDono();

  const admin = supabaseAdmin();
  const [{ data: carteira }, { data: devedores }] = await Promise.all([
    admin.from("carteiras").select("credor").eq("id", carteiraId).maybeSingle(),
    admin.from("devedores").select("id, nome, processo, saldo, vencimento, cpf_cnpj")
      .eq("carteira_id", carteiraId).gt("saldo", 0).order("id").limit(CANDIDATOS),
  ]);

  let comDesconto: Record<string, string> | null = null;
  let semDesconto: Record<string, string> | null = null;
  for (const dev of devedores ?? []) {
    if (comDesconto && semDesconto) break;
    const { data: proposta } = await admin.rpc("fn_proposta", { p_devedor_id: dev.id });
    const pp = proposta?.erro ? null : descontoEfetivoPP(proposta?.valor_original, proposta?.valor_final);
    if (pp !== null && comDesconto) continue;
    if (pp === null && semDesconto) continue;

    const primeiro = String(dev.nome ?? "").trim().split(/\s+/)[0] ?? "";
    const valores: Record<string, string> = {
      nome: formatarNomeCompleto(dev.nome),
      primeiro_nome: primeiro.charAt(0) + primeiro.slice(1).toLowerCase(),
      credor: String(carteira?.credor ?? ""),
      valor: formatarBRL(dev.saldo),
      vencimento: formatarDataBR(dev.vencimento),
      ano: /^(\d{4})/.exec(String(dev.vencimento ?? ""))?.[1] ?? "",
      cpf_final: finalDoCpf(dev.cpf_cnpj),
      processo: String(dev.processo ?? "").trim(),
      valor_quitacao: pp === null ? "" : formatarBRL(proposta?.valor_final),
      desconto_pct: pp === null ? "" : `${pp}%`,
      valor_pago: formatarBRL(pp === null ? dev.saldo : proposta?.valor_final),
      data_pagamento: new Date().toLocaleDateString("pt-BR"),
    };
    if (pp === null) semDesconto = valores; else comDesconto = valores;
  }

  return NextResponse.json({ ok: true, com_desconto: comDesconto, sem_desconto: semDesconto });
}
