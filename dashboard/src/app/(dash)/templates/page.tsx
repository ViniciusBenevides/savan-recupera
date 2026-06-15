import { supabaseServer } from "@/lib/supabase-server";
import { SectionTitle } from "@/components/ui/primitives";
import { TemplatesManager } from "./manager";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const sb = await supabaseServer();
  const { data: templates } = await sb.from("templates_mensagem").select("*").order("tipo").order("id");
  return (
    <>
      <SectionTitle title="Mensagens" sub="Modelos usados pelo bot. Use {{variáveis}} e variações {opção 1|opção 2}." />
      <TemplatesManager inicial={templates ?? []} />
    </>
  );
}
