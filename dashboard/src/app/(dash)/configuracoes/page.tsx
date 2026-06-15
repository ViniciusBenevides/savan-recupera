import { supabaseServer } from "@/lib/supabase-server";
import { SectionTitle } from "@/components/ui/primitives";
import { ConfigForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user!.id).maybeSingle();
  const { data: asaas } = await sb.from("configuracoes").select("valor").eq("chave", "asaas").maybeSingle();
  const { data: ia } = await sb.from("configuracoes").select("valor").eq("chave", "ia").maybeSingle();
  const { data: usuarios } = await sb.from("usuarios_app").select("id, nome, email, role").order("criado_em");

  return (
    <>
      <SectionTitle title="Configurações" sub="Asaas, integrações e usuários do painel." />
      <ConfigForm
        ehAdmin={perfil?.role === "admin"}
        asaas={asaas?.valor ?? {}}
        ia={ia?.valor ?? {}}
        usuarios={usuarios ?? []}
      />
    </>
  );
}
