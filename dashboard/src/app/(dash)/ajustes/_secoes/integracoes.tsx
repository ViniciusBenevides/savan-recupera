import { supabaseServer } from "@/lib/supabase-server";
import { Card } from "@/components/ui/primitives";
import { FileBadge } from "lucide-react";
import { resolverEscopoConta, type Sessao } from "@/lib/auth";
import { getConfigEscopo } from "@/lib/config";
import { IntegracoesForm } from "./integracoes-form";
import { ModeloIA } from "./modelo-ia";
import { MetaTemplates } from "./meta-templates";

/**
 * Aba "Integrações" — Asaas, chaves de API e os dois serviços externos que o robô depende para
 * existir: o modelo de IA que ele usa para pensar e os templates que a Meta precisa aprovar.
 *
 * Os dois vieram da tela de Robô quando ela deixou de existir (§35). Não são "como o robô fala" —
 * isso agora é o fluxo de cada carteira — e sim contratos com fornecedores: um custa por token, o
 * outro passa por aprovação. Configura-se uma vez, junto do resto da infraestrutura.
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

      <div className="border-t border-line pt-4">
        <Card className="mb-4 border-blue/25 bg-blue/5">
          <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
            <FileBadge className="h-4 w-4 text-blue" /> Templates da Meta (só para os números oficiais)
          </h3>
          <p className="mt-1.5 text-sm text-mist">
            O texto do disparo de cada carteira vive no fluxo dela. Mas para{" "}
            <b className="text-chalk">iniciar</b> uma conversa por um número oficial da{" "}
            <b className="text-chalk">WhatsApp Cloud API</b>, a Meta só aceita um template{" "}
            <b className="text-chalk">aprovado por ela</b> — e a aprovação é por conta/número, não por
            carteira, por isso ela mora aqui. Depois que a pessoa responde, a conversa segue livre por
            24h e volta a seguir o fluxo.
          </p>
        </Card>
        <MetaTemplates conta={null} />
      </div>
    </div>
  );
}
