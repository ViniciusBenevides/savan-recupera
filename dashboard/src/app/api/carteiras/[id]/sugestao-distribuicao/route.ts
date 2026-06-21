import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import {
  planoIgualitario, planoPorUf, planoPorCidade, recomendarEstrategia,
  type ChipInfo, type Curva, type ContagemUf, type ContagemCidade,
} from "@/lib/distribuicao";

const USAVEIS = ["cadastrado", "conectado", "aquecendo", "ativo"];

async function exigirOperador() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { erro: "nao_autenticado", status: 401 };
  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user.id).maybeSingle();
  if (!perfil || !["admin", "operador"].includes(perfil.role)) return { erro: "sem_permissao", status: 403 };
  return { user };
}

// GET ?estrategia=uf|cidade|igualitario — devolve o plano da estratégia (ou da recomendada)
// com volume e ETA por chip, mais a recomendação do sistema e a contagem por UF.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await exigirOperador();
  if ("erro" in guard) return NextResponse.json({ erro: guard.erro }, { status: guard.status });

  const admin = supabaseAdmin();
  const carteiraId = Number(id);

  const [{ data: dados }, { data: chipsRaw }, { data: cfg }] = await Promise.all([
    admin.rpc("fn_distribuicao_dados", { p_carteira_id: carteiraId }),
    admin.from("chips").select("id, nome, maturidade, aquecimento_perfil, limite_dia_override, status").in("status", USAVEIS).order("id"),
    admin.from("configuracoes").select("chave, valor").like("chave", "aquecimento%"),
  ]);

  const total: number = dados?.total ?? 0;
  const porUf: ContagemUf[] = dados?.por_uf ?? [];
  const porCidade: ContagemCidade[] = dados?.por_cidade ?? [];
  const chips: ChipInfo[] = (chipsRaw ?? []).map((c) => ({
    id: c.id, nome: c.nome, maturidade: c.maturidade ?? "novo",
    aquecimento_perfil: c.aquecimento_perfil ?? null, limite_dia_override: c.limite_dia_override ?? null,
  }));
  const curvas: Record<string, Curva> = Object.fromEntries((cfg ?? []).map((r) => [r.chave, r.valor as Curva]));

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
