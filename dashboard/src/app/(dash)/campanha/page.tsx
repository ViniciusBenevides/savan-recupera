import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-server";
import { SectionTitle } from "@/components/ui/primitives";
import { SeletorConta } from "@/components/SeletorConta";
import { getSessao, resolverEscopoConta, listarCobradores } from "@/lib/auth";
import { getConfigEscopo } from "@/lib/config";
import { CampanhaControls } from "./controls";

export const dynamic = "force-dynamic";

export default async function CampanhaPage({ searchParams }: { searchParams: Promise<{ conta?: string }> }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (!["admin", "cobrador"].includes(sessao.role)) redirect("/");

  const { conta } = await searchParams;
  const escopo = await resolverEscopoConta(sessao, conta);
  const ehAdmin = sessao.role === "admin";

  const cfg = await getConfigEscopo(escopo.cobradorId);

  // fila do escopo: cobrador vê só as suas carteiras; admin (global) vê tudo; admin numa conta vê as do cobrador
  const admin = supabaseAdmin();
  let carteiraIds: number[] | null = null;
  if (escopo.cobradorId) {
    const { data: carts } = await admin.from("carteiras").select("id").eq("cobrador_id", escopo.cobradorId);
    carteiraIds = (carts ?? []).map((c) => c.id);
  }
  const filtro = (q: any) => (carteiraIds ? q.in("carteira_id", carteiraIds.length ? carteiraIds : [-1]) : q);
  const { count: aguardando } = await filtro(admin.from("fila_envios").select("id", { count: "exact", head: true }).eq("status", "aguardando"));
  const { count: enviados } = await filtro(admin.from("fila_envios").select("id", { count: "exact", head: true }).eq("status", "enviado"));

  return (
    <>
      <SectionTitle title="Campanha" sub="Ligue, pause e ajuste as regras do disparo automático." />
      {ehAdmin && <SeletorConta cobradores={await listarCobradores()} conta={conta ?? "global"} />}
      <CampanhaControls
        cfg={cfg}
        aguardando={aguardando ?? 0}
        enviados={enviados ?? 0}
        conta={escopo.cobradorId ? conta ?? "" : "global"}
        ehGlobal={escopo.ehGlobal}
      />
    </>
  );
}
