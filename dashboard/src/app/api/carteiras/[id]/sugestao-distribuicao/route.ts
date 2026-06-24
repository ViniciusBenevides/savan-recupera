import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { exigirCobrador, podeEditarCarteira, erroDono } from "@/lib/auth";
import {
  planoIgualitario, planoPorUf, planoPorCidade, recomendarEstrategia,
  type ChipInfo, type Curva, type ContagemUf, type ContagemCidade,
} from "@/lib/distribuicao";

const USAVEIS = ["cadastrado", "conectado", "aquecendo", "ativo"];

// GET ?estrategia=uf|cidade|igualitario — devolve o plano da estratégia (ou da recomendada)
// com volume e ETA por chip, mais a recomendação do sistema e a contagem por UF.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await exigirCobrador();
  if (g.erro) return g.erro;
  const carteiraId = Number(id);
  if (!(await podeEditarCarteira(g.sessao, carteiraId))) return erroDono();
  const soMeu = g.sessao.role === "cobrador" ? g.sessao.user.id : null;

  const admin = supabaseAdmin();

  let chipsQ = admin.from("chips").select("id, nome, maturidade, aquecimento_perfil, limite_dia_override, status").in("status", USAVEIS).order("id");
  if (soMeu) chipsQ = chipsQ.eq("cobrador_id", soMeu);
  const [{ data: dados }, { data: chipsRaw }, { data: carteira }, { data: cfgGlob }] = await Promise.all([
    admin.rpc("fn_distribuicao_dados", { p_carteira_id: carteiraId }),
    chipsQ,
    admin.from("carteiras").select("cobrador_id").eq("id", carteiraId).maybeSingle(),
    admin.from("configuracoes").select("chave, valor").like("chave", "aquecimento%").is("cobrador_id", null),
  ]);

  const total: number = dados?.total ?? 0;
  const porUf: ContagemUf[] = dados?.por_uf ?? [];
  const porCidade: ContagemCidade[] = dados?.por_cidade ?? [];
  const chips: ChipInfo[] = (chipsRaw ?? []).map((c) => ({
    id: c.id, nome: c.nome, maturidade: c.maturidade ?? "novo",
    aquecimento_perfil: c.aquecimento_perfil ?? null, limite_dia_override: c.limite_dia_override ?? null,
  }));
  // curvas de aquecimento: padrão global + overlay do cobrador dono da carteira (mesmo escopo do fn_limite_chip)
  const curvas: Record<string, Curva> = Object.fromEntries((cfgGlob ?? []).map((r) => [r.chave, r.valor as Curva]));
  if (carteira?.cobrador_id) {
    const { data: cfgCob } = await admin.from("configuracoes").select("chave, valor")
      .like("chave", "aquecimento%").eq("cobrador_id", carteira.cobrador_id);
    for (const r of cfgCob ?? []) curvas[r.chave] = r.valor as Curva;
  }

  if (chips.length === 0) {
    return NextResponse.json({ sem_chips: true, total, por_uf: porUf });
  }

  const recomendada = recomendarEstrategia(chips.length, porUf);
  const url = new URL(req.url);
  const estrategia = (url.searchParams.get("estrategia") as string) || recomendada;

  let planos;
  if (estrategia === "uf" || estrategia === "manual") planos = planoPorUf(porUf, chips, curvas);
  else if (estrategia === "cidade") planos = planoPorCidade(porCidade, chips, curvas);
  else planos = planoIgualitario(total, chips, curvas);

  const ufsReais = porUf.filter((u) => u.uf && u.uf !== "??").length;
  const cidadesReais = porCidade.filter((c) => c.cidade && c.cidade !== "??").length;
  const explicacao = estrategia === "uf"
    ? `Dividindo por estado: ${ufsReais} UF(s) entre ${chips.length} chip(s), equilibrando o volume e respeitando o aquecimento de cada chip. O ETA é a partir da ativação de cada chip.`
    : estrategia === "cidade"
    ? `Dividindo por cidade: ${cidadesReais} cidade(s) entre ${chips.length} chip(s), equilibrando o volume. O aquecimento é respeitado no envio; o ETA é a partir da ativação de cada chip.`
    : `Dividindo igualitariamente entre ${chips.length} chip(s), proporcional à capacidade de cada um. O aquecimento é respeitado no envio; o ETA estima os dias para esvaziar cada pilha.`;

  return NextResponse.json({
    total, recomendada, estrategia, planos, explicacao,
    por_uf: porUf, por_cidade: porCidade, n_chips: chips.length,
  });
}
