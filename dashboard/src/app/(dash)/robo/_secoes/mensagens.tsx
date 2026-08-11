import { supabaseAdmin } from "@/lib/supabase-server";
import { Card } from "@/components/ui/primitives";
import { FileBadge } from "lucide-react";
import type { Escopo } from "@/lib/auth";
import { LinhaDoTempo } from "./linha-do-tempo";
import { TemplatesManager } from "./mensagens-manager";
import { TemplatesManager as MetaManager } from "./meta-manager";

/**
 * Aba "Mensagens" — junta os modelos do robô com os templates da Meta, que eram duas
 * entradas de menu diferentes para a mesma pergunta ("o que ele escreve?"). A diferença real
 * (um é texto livre nosso, o outro precisa de aprovação da Meta para o 1º contato frio pelo
 * número oficial) fica explicada aqui embaixo, e não espalhada em dois lugares.
 */
export async function Mensagens({ escopo, conta }: { escopo: Escopo; conta?: string }) {
  const admin = supabaseAdmin();
  let q = admin.from("templates_mensagem").select("*").order("tipo").order("id");
  q = escopo.cobradorId ? q.eq("cobrador_id", escopo.cobradorId) : q.is("cobrador_id", null);
  const { data: templates } = await q;

  const contaParam = escopo.cobradorId ? conta ?? "" : "global";

  return (
    <>
      <LinhaDoTempo destaque="modelos" />

      <TemplatesManager
        inicial={templates ?? []}
        conta={contaParam}
        ehGlobal={escopo.ehGlobal}
        podeClonar={!escopo.ehGlobal}
      />

      <div className="mt-8 border-t border-line pt-6">
        <Card className="mb-4 border-blue/25 bg-blue/5">
          <h3 className="flex items-center gap-2 font-display text-base font-600 text-chalk">
            <FileBadge className="h-4 w-4 text-blue" /> Templates da Meta (só para os números oficiais)
          </h3>
          <p className="mt-1.5 text-sm text-mist">
            Os modelos acima valem para os chips conectados por QR (Z-API). Já pelos números oficiais da{" "}
            <b className="text-chalk">WhatsApp Cloud API</b>, a Meta só deixa iniciar uma conversa com um
            template <b className="text-chalk">aprovado por ela</b>. Depois que a pessoa responde, a
            conversa segue livre e volta a usar os modelos de cima.
          </p>
        </Card>
        <MetaManager conta={conta ?? null} />
      </div>
    </>
  );
}
