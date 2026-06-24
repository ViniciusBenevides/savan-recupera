import { redirect } from "next/navigation";
import { SectionTitle } from "@/components/ui/primitives";
import { SeletorConta } from "@/components/SeletorConta";
import { getSessao, resolverEscopoConta, listarCobradores } from "@/lib/auth";
import { getConfigEscopo } from "@/lib/config";
import { DescontosEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function DescontosPage({ searchParams }: { searchParams: Promise<{ conta?: string }> }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (!["admin", "cobrador"].includes(sessao.role)) redirect("/");

  const { conta } = await searchParams;
  const escopo = await resolverEscopoConta(sessao, conta);
  const ehAdmin = sessao.role === "admin";

  const cfg = await getConfigEscopo(escopo.cobradorId);
  const inicial = cfg.faixas_desconto ?? { faixas: [], valor_minimo_pix: 30, margem_extra_pp: 10 };

  return (
    <>
      <SectionTitle title="Descontos" sub="Quanto de desconto o bot oferece conforme a idade da dívida." />
      {ehAdmin && <SeletorConta cobradores={await listarCobradores()} conta={conta ?? "global"} />}
      <DescontosEditor inicial={inicial} conta={escopo.cobradorId ? conta ?? "" : "global"} ehGlobal={escopo.ehGlobal} />
    </>
  );
}
