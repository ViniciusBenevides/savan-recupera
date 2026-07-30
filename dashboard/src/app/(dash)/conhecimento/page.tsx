import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-server";
import { SectionTitle } from "@/components/ui/primitives";
import { SeletorConta } from "@/components/SeletorConta";
import { getSessao, resolverEscopoConta, listarCobradores } from "@/lib/auth";
import { ConhecimentoManager } from "./manager";

export const dynamic = "force-dynamic";

export default async function ConhecimentoPage({ searchParams }: { searchParams: Promise<{ conta?: string }> }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (!["admin", "cobrador"].includes(sessao.role)) redirect("/");

  const { conta } = await searchParams;
  const escopo = await resolverEscopoConta(sessao, conta);
  const admin = supabaseAdmin();

  const q = admin.from("bot_conhecimento").select("*").order("aprovado").order("id", { ascending: false });
  const { data: entradas } = escopo.cobradorId
    ? await q.eq("cobrador_id", escopo.cobradorId)
    : await q.is("cobrador_id", null);

  const cq = admin.from("carteiras").select("id, nome").order("nome");
  const { data: carteiras } = escopo.cobradorId ? await cq.eq("cobrador_id", escopo.cobradorId) : await cq;

  return (
    <>
      <SectionTitle
        title="Base de conhecimento"
        sub="Respostas prontas que o robô pode usar. Só entram em uso depois de aprovadas."
      />
      {sessao.role === "admin" && <SeletorConta cobradores={await listarCobradores()} conta={conta ?? "global"} />}
      <ConhecimentoManager
        entradas={entradas ?? []}
        carteiras={carteiras ?? []}
        conta={escopo.cobradorId ? conta ?? "" : "global"}
      />
    </>
  );
}
