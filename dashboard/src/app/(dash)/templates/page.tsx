import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-server";
import { SectionTitle } from "@/components/ui/primitives";
import { SeletorConta } from "@/components/SeletorConta";
import { getSessao, resolverEscopoConta, listarCobradores } from "@/lib/auth";
import { TemplatesManager } from "./manager";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ conta?: string }> }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (!["admin", "cobrador"].includes(sessao.role)) redirect("/");

  const { conta } = await searchParams;
  const escopo = await resolverEscopoConta(sessao, conta);
  const ehAdmin = sessao.role === "admin";

  // modelos do escopo (service role + escopo explícito); cobrador começa vazio e herda o global
  const admin = supabaseAdmin();
  let q = admin.from("templates_mensagem").select("*").order("tipo").order("id");
  q = escopo.cobradorId ? q.eq("cobrador_id", escopo.cobradorId) : q.is("cobrador_id", null);
  const { data: templates } = await q;

  return (
    <>
      <SectionTitle title="Mensagens" sub="Modelos usados pelo bot. Use {{variáveis}} e variações {opção 1|opção 2}." />
      {ehAdmin && <SeletorConta cobradores={await listarCobradores()} conta={conta ?? "global"} />}
      <TemplatesManager
        inicial={templates ?? []}
        conta={escopo.cobradorId ? conta ?? "" : "global"}
        ehGlobal={escopo.ehGlobal}
        podeClonar={!escopo.ehGlobal}
      />
    </>
  );
}
