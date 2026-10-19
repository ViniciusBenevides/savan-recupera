import { supabaseServer } from "@/lib/supabase-server";
import { ContaForm } from "./conta-form";

/** Aba "Minha conta" — nome e senha de quem está logado. */
export async function Conta() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: perfil } = await sb.from("usuarios_app").select("nome, role").eq("id", user!.id).maybeSingle();

  return <ContaForm email={user!.email ?? ""} nome={perfil?.nome ?? ""} role={perfil?.role ?? "visualizador"} />;
}
