import { supabaseServer } from "@/lib/supabase-server";
import { EscalacoesLista } from "./escalacoes-lista";

/**
 * Aba "Precisam de você" — eram as "Escalações". É a mesma conversa da aba ao lado, só que
 * no momento em que o robô passou o caso para um humano; por isso mora aqui e não num menu próprio.
 */
export async function Escaladas() {
  const sb = await supabaseServer();
  // O atendimento acontece na conversa do próprio MC COB: nada aqui aponta para o Chatwoot.
  const { data, error } = await sb.from("escalacoes")
    .select(`
      *,
      devedores(nome, cpf_cnpj),
      chip_bot:chips!escalacoes_chip_id_fkey(nome),
      escalador:chips!escalacoes_equipe_chip_id_fkey(nome),
      pagamentos(valor, status),
      carteiras(nome)
    `)
    .order("criado_em", { ascending: false })
    .limit(200);

  return <EscalacoesLista inicial={data ?? []} erro={error?.message ?? null} />;
}

/** Quantas escalações estão abertas — vira o contador da aba. */
export async function contarEscalacoesAbertas(): Promise<number> {
  const sb = await supabaseServer();
  const { count } = await sb.from("escalacoes")
    .select("id", { count: "exact", head: true })
    .in("status", ["aberta", "em_atendimento"]);
  return count ?? 0;
}
