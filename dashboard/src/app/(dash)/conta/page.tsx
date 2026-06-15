import { supabaseServer } from "@/lib/supabase-server";
import { SectionTitle } from "@/components/ui/primitives";
import { ContaForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ContaPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: perfil } = await sb.from("usuarios_app").select("nome, role").eq("id", user!.id).maybeSingle();

  return (
    <>
      <SectionTitle title="Minha conta" sub="Altere seu nome e sua senha de acesso." />
      <ContaForm email={user!.email ?? ""} nome={perfil?.nome ?? ""} role={perfil?.role ?? "visualizador"} />
    </>
  );
}
