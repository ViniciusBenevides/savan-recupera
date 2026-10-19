import { supabaseServer } from "@/lib/supabase-server";
import { resolverEscopoConta, type Sessao } from "@/lib/auth";
import { getConfigEscopo } from "@/lib/config";
import { IntegracoesForm } from "./integracoes-form";
import { ModeloIA } from "./modelo-ia";

/**
 * Aba "Integrações" — Asaas, chaves de API e o modelo de IA que o robô usa para pensar.
 *
 * Os templates da Meta moravam aqui e saíram para a aba "Modelos": chave de API se cola uma vez,
 * template fica numa fila de aprovação que precisa ser acompanhada — e é ela que destrava (ou
 * trava) a campanha.
 */
export async function Integracoes({ sessao }: { sessao: Sessao }) {
  const sb = await supabaseServer();
  const { data: cfg } = await sb.from("configuracoes").select("chave, valor")
    .eq("chave", "asaas").is("cobrador_id", null).maybeSingle();

  // `ia` é chave por conta: o cobrador edita a dele; o admin edita o padrão global.
  const escopo = await resolverEscopoConta(sessao);
  const cfgEscopo = await getConfigEscopo(escopo.cobradorId);

  return (
    <div className="flex flex-col gap-4">
      <IntegracoesForm role={sessao.role} asaas={cfg?.valor ?? {}} />

      <ModeloIA iaAtual={cfgEscopo.ia ?? {}} />

    </div>
  );
}
