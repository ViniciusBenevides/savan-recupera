import { supabaseServer } from "@/lib/supabase-server";
import type { Sessao } from "@/lib/auth";
import { EquipeForm } from "./equipe-form";

/** Aba "Equipe" — usuários do painel e seus papéis. */
export async function Equipe({ sessao }: { sessao: Sessao }) {
  const sb = await supabaseServer();
  const ehAdmin = sessao.role === "admin";

  // RLS escopa: admin vê todos; cobrador vê a si + seu tenant (credor/visualizadores).
  const { data: usuarios } = await sb.from("usuarios_app")
    .select("id, nome, email, role, cobrador_id").order("criado_em");
  // carteiras do ator (p/ ligar um credor) e cobradores (admin designa tenant)
  const { data: carteiras } = await sb.from("carteiras").select("id, nome").order("nome");
  const { data: cobradores } = ehAdmin
    ? await sb.from("usuarios_app").select("id, nome, email").eq("role", "cobrador").order("nome")
    : { data: [] };

  return (
    <EquipeForm
      role={sessao.role}
      usuarios={usuarios ?? []}
      carteiras={carteiras ?? []}
      cobradores={cobradores ?? []}
      meuId={sessao.user.id}
    />
  );
}
