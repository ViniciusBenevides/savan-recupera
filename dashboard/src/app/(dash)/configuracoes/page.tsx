import { supabaseServer } from "@/lib/supabase-server";
import { SectionTitle } from "@/components/ui/primitives";
import { ConfigForm } from "./form";
import { BotGlobal } from "./bot-global";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: perfil } = await sb.from("usuarios_app").select("role").eq("id", user!.id).maybeSingle();
  const { data: cfg } = await sb.from("configuracoes").select("chave, valor")
    .in("chave", ["asaas", "ia", "bot_persona", "bot_contexto", "bot_guardrails"]);
  const c: Record<string, any> = {};
  for (const r of cfg ?? []) c[r.chave] = r.valor;
  const { data: usuarios } = await sb.from("usuarios_app").select("id, nome, email, role").order("criado_em");

  return (
    <>
      <SectionTitle title="Configurações" sub="Robô, Asaas, integrações e usuários do painel." />
      <ConfigForm
        ehAdmin={perfil?.role === "admin"}
        asaas={c.asaas ?? {}}
        ia={c.ia ?? {}}
        usuarios={usuarios ?? []}
      />
      <div className="mt-4">
        <BotGlobal persona={c.bot_persona ?? ""} contexto={c.bot_contexto ?? ""} guardrails={c.bot_guardrails ?? {}} />
      </div>
    </>
  );
}
