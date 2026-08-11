import { SectionTitle, Badge } from "@/components/ui/primitives";
import { Abas, resolverAba } from "@/components/Abas";
import { getSessao } from "@/lib/auth";
import { getConfigEscopo } from "@/lib/config";
import { Gauge, HandCoins, LineChart } from "lucide-react";
import { Resumo } from "./_inicio/resumo";
import { Dinheiro } from "./_inicio/dinheiro";
import { Historico } from "./_inicio/historico";

export const dynamic = "force-dynamic";

// Início = "como está indo?". Absorve o que eram três telas separadas com os mesmos números
// (Visão geral, Pagamentos e Relatórios) mais a chave geral que vivia sozinha em Campanha.
const ABAS = [
  { k: "resumo", t: "Resumo", icon: Gauge },
  { k: "dinheiro", t: "Dinheiro", icon: HandCoins },
  { k: "historico", t: "Histórico", icon: LineChart },
];

export default async function Inicio({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba: pedida } = await searchParams;
  const aba = resolverAba(ABAS, pedida);
  const sessao = await getSessao();
  const cfg = await getConfigEscopo(sessao?.tenant ?? null);

  const ativa = cfg.campanha_ativa === true;
  const simulacao = cfg.modo_simulacao === true;

  const sub = {
    resumo: "Resultados da recuperação em tempo real.",
    dinheiro: "Pix gerados, recebidos e a sua comissão.",
    historico: "Dia a dia da campanha, melhor horário e desempenho por mensagem.",
  }[aba];

  return (
    <>
      <SectionTitle
        title="Início"
        sub={sub}
        action={
          <div className="flex items-center gap-2">
            {simulacao && <Badge tone="amber">Modo simulação</Badge>}
            <Badge tone={ativa ? "green" : "neutral"}>
              <span className={`h-2 w-2 rounded-full ${ativa ? "bg-emerald animate-pulseglow" : "bg-mist"}`} />
              {ativa ? "Campanha ativa" : "Campanha parada"}
            </Badge>
          </div>
        }
      />

      <Abas abas={ABAS} atual={aba} />

      {aba === "resumo" && <Resumo sessao={sessao} />}
      {aba === "dinheiro" && <Dinheiro />}
      {aba === "historico" && <Historico />}
    </>
  );
}
