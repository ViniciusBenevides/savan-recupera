import { supabaseServer } from "@/lib/supabase-server";
import type { Sessao } from "@/lib/auth";
import { IntegracoesForm } from "./integracoes-form";

/** Aba "Integrações" — Asaas e as chaves de API. */
export async function Integracoes({ sessao }: { sessao: Sessao }) {
  const sb = await supabaseServer();
  const { data: cfg } = await sb.from("configuracoes").select("chave, valor")
    .eq("chave", "asaas").is("cobrador_id", null).maybeSingle();

  return <IntegracoesForm role={sessao.role} asaas={cfg?.valor ?? {}} />;
}
