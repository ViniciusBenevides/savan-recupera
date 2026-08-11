import { supabaseServer } from "@/lib/supabase-server";
import { getConfigEscopo } from "@/lib/config";
import type { Escopo, Sessao } from "@/lib/auth";
import { BotGlobal } from "./comportamento-form";
import { ModeloIA } from "./modelo-ia";
import { DescontosEditor } from "./descontos-editor";
import { Card } from "@/components/ui/primitives";
import { Percent } from "lucide-react";

/**
 * Aba "Comportamento" — como o robô fala e o que ele pode oferecer. Reúne o que estava em
 * Configurações (persona/guardrails + modelo de IA) e na tela solta de Descontos: são a mesma
 * decisão ("até onde ele pode ir na negociação"), então ficam na mesma tela.
 */
export async function Comportamento({ sessao, escopo, conta }: {
  sessao: Sessao; escopo: Escopo; conta?: string;
}) {
  const sb = await supabaseServer();
  const ehAdmin = sessao.role === "admin";

  const { data: cfgRows } = await sb.from("configuracoes").select("chave, valor")
    .in("chave", ["bot_persona", "bot_contexto", "bot_guardrails"]).is("cobrador_id", null);
  const c: Record<string, any> = {};
  for (const r of cfgRows ?? []) c[r.chave] = r.valor;

  const cfgEscopo = await getConfigEscopo(escopo.cobradorId);
  const faixas = cfgEscopo.faixas_desconto ?? { faixas: [], valor_minimo_pix: 30, margem_extra_pp: 10 };
  const contaParam = escopo.cobradorId ? conta ?? "" : "global";

  return (
    <div className="flex flex-col gap-4">
      {/* Persona/guardrails são o padrão global da plataforma — só o admin edita. */}
      {ehAdmin && (
        <BotGlobal persona={c.bot_persona ?? ""} contexto={c.bot_contexto ?? ""} guardrails={c.bot_guardrails ?? {}} />
      )}

      <ModeloIA iaAtual={cfgEscopo.ia ?? {}} />

      <div>
        <Card className="mb-4 bg-ink-850/50">
          <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
            <Percent className="h-4 w-4 text-amber" /> Descontos que ele pode oferecer
          </h3>
          <p className="mt-1.5 text-sm text-mist">
            Quanto de desconto o robô oferece conforme a idade da dívida. Uma carteira específica pode
            fugir destas faixas na própria tela dela.
          </p>
        </Card>
        <DescontosEditor inicial={faixas} conta={contaParam} ehGlobal={escopo.ehGlobal} />
      </div>
    </div>
  );
}
