import { redirect } from "next/navigation";
import { SectionTitle } from "@/components/ui/primitives";
import { SeletorConta } from "@/components/SeletorConta";
import { Abas } from "@/components/Abas";
import { resolverAba, type Aba } from "@/lib/abas";
import { getSessao, resolverEscopoConta, listarCobradores } from "@/lib/auth";
import { Envio } from "./_secoes/envio";
import { Chips } from "./_secoes/chips";
import { Integracoes } from "./_secoes/integracoes";
import { Equipe } from "./_secoes/equipe";
import { Conta } from "./_secoes/conta";
import { Ajuda } from "./_secoes/ajuda";

export const dynamic = "force-dynamic";

// Ajustes = "como a máquina roda?". Absorve Campanha (as regras), Chips, Custos,
// Configurações, Minha conta e Ajuda — seis entradas de menu que só se mexe de vez em quando.
export default async function AjustesPage({ searchParams }: {
  searchParams: Promise<{ aba?: string; conta?: string }>;
}) {
  const { aba: pedida, conta } = await searchParams;
  const sessao = await getSessao();
  if (!sessao) redirect("/login");

  const podeOperar = ["admin", "cobrador"].includes(sessao.role);
  const ehAdmin = sessao.role === "admin";

  // credor/visualizador só têm conta e ajuda — o resto é infraestrutura de quem opera.
  const abas : Aba[] = [
    ...(podeOperar ? [
      { k: "envio", t: "Envio", icon: "Send" },
      { k: "chips", t: "Chips", icon: "Smartphone" },
      { k: "integracoes", t: "Integrações", icon: "Plug" },
      { k: "equipe", t: "Equipe", icon: "Users" },
    ] satisfies Aba[] : []),
    { k: "conta", t: "Minha conta", icon: "UserCog" },
    { k: "ajuda", t: "Ajuda", icon: "LifeBuoy" },
  ];
  const aba = resolverAba(abas, pedida);

  const sub: Record<string, string> = {
    envio: "Quando e em que ritmo o robô envia.",
    chips: "Os números de WhatsApp por onde ele conversa.",
    integracoes: "Asaas, chaves de API e serviços externos.",
    equipe: "Quem entra no painel e com que permissão.",
    conta: "Altere seu nome e sua senha de acesso.",
    ajuda: "Manual da plataforma, do primeiro acesso ao go-live.",
  };

  const escopo = podeOperar ? await resolverEscopoConta(sessao, conta) : null;
  const mostraSeletor = ehAdmin && aba === "envio";

  return (
    <>
      <SectionTitle title="Ajustes" sub={sub[aba]} />
      {mostraSeletor && <SeletorConta cobradores={await listarCobradores()} conta={conta ?? "global"} />}

      <Abas abas={abas} atual={aba} />

      {aba === "envio" && escopo && <Envio escopo={escopo} conta={conta} />}
      {aba === "chips" && <Chips sessao={sessao} />}
      {aba === "integracoes" && <Integracoes sessao={sessao} />}
      {aba === "equipe" && <Equipe sessao={sessao} />}
      {aba === "conta" && <Conta />}
      {aba === "ajuda" && <Ajuda />}
    </>
  );
}
