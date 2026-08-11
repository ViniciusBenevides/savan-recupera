import { supabaseAdmin } from "@/lib/supabase-server";
import type { Escopo } from "@/lib/auth";
import { ConhecimentoManager } from "./conhecimento-manager";

/** Aba "Conhecimento" — respostas prontas que o robô só usa depois de aprovadas. */
export async function Conhecimento({ escopo, conta }: { escopo: Escopo; conta?: string }) {
  const admin = supabaseAdmin();

  const q = admin.from("bot_conhecimento").select("*").order("aprovado").order("id", { ascending: false });
  const { data: entradas } = escopo.cobradorId
    ? await q.eq("cobrador_id", escopo.cobradorId)
    : await q.is("cobrador_id", null);

  const cq = admin.from("carteiras").select("id, nome").order("nome");
  const { data: carteiras } = escopo.cobradorId ? await cq.eq("cobrador_id", escopo.cobradorId) : await cq;

  return (
    <ConhecimentoManager
      entradas={entradas ?? []}
      carteiras={carteiras ?? []}
      conta={escopo.cobradorId ? conta ?? "" : "global"}
    />
  );
}
