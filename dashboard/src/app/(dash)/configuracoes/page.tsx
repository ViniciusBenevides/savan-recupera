import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getConfigEscopo } from "@/lib/config";
import { SectionTitle } from "@/components/ui/primitives";
import { ConfigForm } from "./form";
import { BotGlobal } from "./bot-global";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user!.id).maybeSingle();
  const role = perfil?.role ?? "visualizador";
  // credor/visualizador não acessam configurações
  if (!["admin", "cobrador"].includes(role)) redirect("/");
  const ehAdmin = role === "admin";

  // só os defaults GLOBAIS (cobrador_id NULL). Asaas/Bot global são admin-only e infra.
  // O nome do bot / modelo de IA (chave `ia`) é por conta e é editado aqui (card Robô).
  const { data: cfg } = await sb.from("configuracoes").select("chave, valor")
    .in("chave", ["asaas", "bot_persona", "bot_contexto", "bot_guardrails"]).is("cobrador_id", null);
  const c: Record<string, any> = {};
  for (const r of cfg ?? []) c[r.chave] = r.valor;

  // nome do bot + modelo de IA (chave `ia`) no escopo do ator: cobrador vê/edita o seu (cai no
  // global); admin edita o padrão global. Usado pelo card Robô em Configurações.
  const cobradorId = role === "cobrador" ? user!.id : null;
  const iaAtual = (await getConfigEscopo(cobradorId)).ia ?? {};

  // RLS escopa: admin vê todos; cobrador vê a si + seu tenant (credor/visualizadores).
  const { data: usuarios } = await sb.from("usuarios_app")
    .select("id, nome, email, role, cobrador_id").order("criado_em");
  // carteiras do ator (p/ ligar um credor) e cobradores (admin designa tenant)
  const { data: carteiras } = await sb.from("carteiras").select("id, nome").order("nome");
  const { data: cobradores } = ehAdmin
    ? await sb.from("usuarios_app").select("id, nome, email").eq("role", "cobrador").order("nome")
    : { data: [] };

  return (
    <>
      <SectionTitle
        title="Configurações"
        sub={ehAdmin ? "Robô, Asaas, integrações e usuários do painel." : "Suas chaves de integração e a sua equipe (credores e visualizadores)."}
      />
      <ConfigForm
        role={role}
        asaas={c.asaas ?? {}}
        iaAtual={iaAtual}
        usuarios={usuarios ?? []}
        carteiras={carteiras ?? []}
        cobradores={cobradores ?? []}
        meuId={user!.id}
      />
      {ehAdmin && (
        <div className="mt-4">
          <BotGlobal persona={c.bot_persona ?? ""} contexto={c.bot_contexto ?? ""} guardrails={c.bot_guardrails ?? {}} />
        </div>
      )}
    </>
  );
}
