import Link from "next/link";
import { SectionTitle, Button } from "@/components/ui/primitives";
import { Abas, resolverAba } from "@/components/Abas";
import { getSessao } from "@/lib/auth";
import { FolderUp, Users, Plus } from "lucide-react";
import { ListaCarteiras } from "./_secoes/lista";
import { ListaDevedores } from "./_secoes/devedores";

export const dynamic = "force-dynamic";

// Carteiras = "quem eu estou cobrando?". Devedores deixou de ser um item de menu à parte
// porque devedor sempre pertence a uma carteira — agora é a visão plana da mesma área.
const ABAS = [
  { k: "carteiras", t: "Carteiras", icon: FolderUp },
  { k: "devedores", t: "Devedores", icon: Users },
];

export default async function CarteirasPage({ searchParams }: {
  searchParams: Promise<{ aba?: string; q?: string; pg?: string; carteira?: string }>;
}) {
  const { aba: pedida, q, pg, carteira } = await searchParams;
  const aba = resolverAba(ABAS, pedida);
  const sessao = await getSessao();
  const role = sessao?.role ?? "visualizador";
  const podeEditar = role === "admin" || role === "cobrador";

  return (
    <>
      <SectionTitle
        title="Carteiras"
        sub={aba === "devedores"
          ? "Todos os devedores importados — busque por nome, CPF ou referência."
          : podeEditar
            ? "Cada planilha que você sobe vira uma carteira de cobrança independente."
            : "Acompanhe o andamento das carteiras (somente leitura)."}
        action={podeEditar && aba === "carteiras" ? (
          <Link href="/carteiras/nova"><Button><Plus className="h-4 w-4" /> Nova carteira</Button></Link>
        ) : undefined}
      />

      <Abas abas={ABAS} atual={aba} />

      {aba === "carteiras" && <ListaCarteiras role={role} />}
      {aba === "devedores" && <ListaDevedores q={q} pg={pg} carteira={carteira} />}
    </>
  );
}
