import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarCarteira, erroDono } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ROTULO_SITUACAO } from "@/lib/resultados";

export const runtime = "nodejs";
export const maxDuration = 30;

type Linha = {
  devedor_id: number; acionavel: boolean; condicao: string; processo: string | null; nome: string; cpf_cnpj: string; saldo: number;
  vencimento: string | null; dias_atraso: number | null; situacao: string; telefones: string | null; whatsapp: string | null;
  proxima_acao: string | null; ultimo_contato_em: string | null; responsavel: string | null; marcadores: string | null; observacao: string | null;
};

// CSV para o Excel em português: ponto e vírgula, BOM no começo e vírgula decimal.
const celula = (v: unknown) => {
  const s = String(v ?? "").replace(/[\r\n]+/g, " ").trim();
  return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dataHora = (iso: string | null) => iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";
const dataBR = (iso: string | null) => iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";

/**
 * GET ?tipo=acionaveis|nao-acionaveis — a planilha da fila da carteira (V5.5.12/13), com a mesma regra
 * e a mesma ordem da tela e do robô (fn_fila_carteira). Gerada na hora a partir do banco.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const carteiraId = Number((await params).id);
  if (!(await podeEditarCarteira(g.sessao, carteiraId))) return erroDono();
  const tipo = new URL(req.url).searchParams.get("tipo") === "nao-acionaveis" ? "nao-acionaveis" : "acionaveis";

  const adm = supabaseAdmin();
  const { data: cart } = await adm.from("carteiras").select("id, nome").eq("id", carteiraId).maybeSingle();
  if (!cart) return NextResponse.json({ erro: "Carteira não encontrada." }, { status: 404 });

  // O PostgREST devolve no máximo 1.000 linhas por vez
  const linhas: Linha[] = [];
  for (let ini = 0; ; ini += 1000) {
    const { data, error } = await adm.rpc("fn_fila_carteira", { p_carteira_id: carteiraId }).range(ini, ini + 999);
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    linhas.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }
  const escolhidas = linhas.filter((l) => (tipo === "acionaveis" ? l.acionavel : !l.acionavel));

  const cabecalho = ["Carteira", "Processo", "Cliente", "CPF/CNPJ", "Saldo", "Vencimento", "Dias em atraso", "Situação", "Condição",
    "Telefones", "Situação do WhatsApp", "Próxima ação", "Último contato", "Responsável", "Marcadores", "Observação"];
  const corpo = escolhidas.map((l) => [
    cart.nome, l.processo, l.nome, l.cpf_cnpj, Number(l.saldo).toFixed(2).replace(".", ","), dataBR(l.vencimento), l.dias_atraso ?? "",
    ROTULO_SITUACAO[l.situacao] ?? l.situacao, l.acionavel ? "Acionável agora" : l.condicao, l.telefones, l.whatsapp, l.proxima_acao,
    dataHora(l.ultimo_contato_em), l.responsavel, l.marcadores, l.observacao,
  ].map(celula).join(";"));
  const csv = "\ufeff" + [cabecalho.join(";"), ...corpo].join("\r\n");

  await registrarAuditoria(adm, g.sessao, { acao: `planilha_${tipo.replace("-", "_")}`, entidade: "carteira", entidade_id: carteiraId, carteira_id: carteiraId, detalhe: { linhas: escolhidas.length } });
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const nome = `${cart.nome.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "CARTEIRA"}_${tipo === "acionaveis" ? "ACIONAVEIS" : "NAO_ACIONAVEIS"}_${hoje}.csv`;
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "no-store" },
  });
}
