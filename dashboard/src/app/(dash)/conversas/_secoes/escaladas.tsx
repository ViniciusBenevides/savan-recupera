import { supabaseServer } from "@/lib/supabase-server";
import { EscalacoesLista } from "./escalacoes-lista";

/**
 * Aba "Precisam de você" — eram as "Escalações". É a mesma conversa da aba ao lado, só que
 * no momento em que o robô passou o caso para um humano; por isso mora aqui e não num menu próprio.
 */
export async function Escaladas() {
  const sb = await supabaseServer();
  const { data } = await sb.from("escalacoes")
    .select("*, devedores(nome, cpf_cnpj), chips(nome), pagamentos(valor, status), carteiras(nome)")
    .order("criado_em", { ascending: false })
    .limit(200);

  return <EscalacoesLista inicial={data ?? []} />;
}

/** Quantas escalações estão abertas — vira o contador da aba. */
export async function contarEscalacoesAbertas(): Promise<number> {
  const sb = await supabaseServer();
  const { count } = await sb.from("escalacoes")
    .select("id", { count: "exact", head: true })
    .in("status", ["aberta", "em_atendimento"]);
  return count ?? 0;
}
