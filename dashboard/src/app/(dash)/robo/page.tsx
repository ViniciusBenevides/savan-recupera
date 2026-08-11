import { redirect } from "next/navigation";
import { SectionTitle } from "@/components/ui/primitives";
import { SeletorConta } from "@/components/SeletorConta";
import { Abas } from "@/components/Abas";
import { resolverAba, type Aba } from "@/lib/abas";
import { getSessao, resolverEscopoConta, listarCobradores } from "@/lib/auth";
import { Mensagens } from "./_secoes/mensagens";
import { Comportamento } from "./_secoes/comportamento";
import { Conhecimento } from "./_secoes/conhecimento";

export const dynamic = "force-dynamic";

// Robô = "como ele fala?". Reúne cinco entradas de menu que respondiam à mesma pergunta:
// Mensagens, Templates Meta, Descontos, o card de comportamento que morava em Configurações
// e a Base de conhecimento.
const ABAS : Aba[] = [
  { k: "mensagens", t: "Mensagens", icon: "MessageSquareText" },
  { k: "comportamento", t: "Comportamento", icon: "Bot" },
  { k: "conhecimento", t: "Conhecimento", icon: "BookOpen" },
];

export default async function RoboPage({ searchParams }: {
  searchParams: Promise<{ aba?: string; conta?: string }>;
}) {
  const { aba: pedida, conta } = await searchParams;
  const aba = resolverAba(ABAS, pedida);

  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (!["admin", "cobrador"].includes(sessao.role)) redirect("/");

  const escopo = await resolverEscopoConta(sessao, conta);
  const ehAdmin = sessao.role === "admin";

  const sub = {
    mensagens: "Os textos que o robô dispara. Use {{variáveis}} e variações {opção 1|opção 2}.",
    comportamento: "Como ele fala, com que modelo de IA pensa e até onde pode negociar.",
    conhecimento: "Respostas prontas que ele pode usar. Só entram em uso depois de aprovadas.",
  }[aba];

  return (
    <>
      <SectionTitle title="Robô" sub={sub} />
      {ehAdmin && <SeletorConta cobradores={await listarCobradores()} conta={conta ?? "global"} />}

      <Abas abas={ABAS} atual={aba} />

      {aba === "mensagens" && <Mensagens escopo={escopo} conta={conta} />}
      {aba === "comportamento" && <Comportamento sessao={sessao} escopo={escopo} conta={conta} />}
      {aba === "conhecimento" && <Conhecimento escopo={escopo} conta={conta} />}
    </>
  );
}
