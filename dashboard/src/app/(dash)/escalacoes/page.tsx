import { supabaseServer } from "@/lib/supabase-server";
import { SectionTitle } from "@/components/ui/primitives";
import { EscalacoesLista } from "./lista";

export const dynamic = "force-dynamic";

export default async function EscalacoesPage() {
  const sb = await supabaseServer();
  const { data } = await sb.from("escalacoes")
    .select("*, devedores(nome, cpf_cnpj), chips(nome), pagamentos(valor, status), carteiras(nome)")
    .order("criado_em", { ascending: false })
    .limit(200);

  return (
    <>
      <SectionTitle
        title="Escalações"
        sub="Casos que o robô passou para atendimento humano — com histórico, status e desfecho. Transparência dos dois lados: o atendente vê todo o contexto e o dono acompanha cada acordo."
      />
      <EscalacoesLista inicial={data ?? []} />
    </>
  );
}
