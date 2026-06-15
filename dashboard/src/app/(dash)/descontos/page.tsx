import { supabaseServer } from "@/lib/supabase-server";
import { SectionTitle } from "@/components/ui/primitives";
import { DescontosEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function DescontosPage() {
  const sb = await supabaseServer();
  const { data } = await sb.from("configuracoes").select("valor").eq("chave", "faixas_desconto").maybeSingle();
  return (
    <>
      <SectionTitle title="Descontos" sub="Quanto de desconto o bot oferece conforme a idade da dívida." />
      <DescontosEditor inicial={data?.valor ?? { faixas: [], valor_minimo_pix: 30, margem_extra_pp: 10 }} />
    </>
  );
}
