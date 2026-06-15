import { supabaseServer } from "@/lib/supabase-server";
import { SectionTitle } from "@/components/ui/primitives";
import { CampanhaControls } from "./controls";

export const dynamic = "force-dynamic";

export default async function CampanhaPage() {
  const sb = await supabaseServer();
  const { data: cfgRows } = await sb.from("configuracoes").select("chave, valor");
  const cfg: Record<string, any> = {};
  for (const r of cfgRows ?? []) cfg[r.chave] = r.valor;

  const { count: aguardando } = await sb.from("fila_envios").select("id", { count: "exact", head: true }).eq("status", "aguardando");
  const { count: enviados } = await sb.from("fila_envios").select("id", { count: "exact", head: true }).eq("status", "enviado");

  return (
    <>
      <SectionTitle title="Campanha" sub="Ligue, pause e ajuste as regras do disparo automático." />
      <CampanhaControls cfg={cfg} aguardando={aguardando ?? 0} enviados={enviados ?? 0} />
    </>
  );
}
