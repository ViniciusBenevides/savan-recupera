import { redirect } from "next/navigation";
import { SectionTitle } from "@/components/ui/primitives";
import { SeletorConta } from "@/components/SeletorConta";
import { Abas } from "@/components/Abas";
import { resolverAba, type Aba } from "@/lib/abas";
import { getSessao, resolverEscopoConta, listarCobradores } from "@/lib/auth";
import { Envio } from "./_secoes/envio";
import { Chips } from "./_secoes/chips";
import { Integracoes } from "./_secoes/integracoes";
import { Modelos } from "./_secoes/modelos";
import { Equipe } from "./_secoes/equipe";
import { Conta } from "./_secoes/conta";
import { Ajuda } from "./_secoes/ajuda";

export const dynamic = "force-dynamic";

// Ajustes = "como a máquina roda?". A conta pessoal é acessada pelo perfil da sidebar
// e não aparece como uma aba ao lado das configurações operacionais.
export default async function AjustesPage({ searchParams }: {
  searchParams: Promise<{ aba?: string; conta?: string }>;
}) {
  const { aba: pedida, conta } = await searchParams;
  const sessao = await getSessao();
  if (!sessao) redirect("/login");

  const podeOperar = ["admin", "cobrador"].includes(sessao.role);
  const ehAdmin = sessao.role === "admin";

  // credor/visualizador só veem a ajuda — o resto é infraestrutura de quem opera.
  const abas: Aba[] = [
    ...(podeOperar ? [
      { k: "envio", t: "Envio", icon: "Send" },
      { k: "chips", t: "Chips", icon: "Smartphone" },
      { k: "modelos", t: "Modelos", icon: "FileBadge" },
      { k: "integracoes", t: "Integrações", icon: "Plug" },
      { k: "equipe", t: "Equipe", icon: "Users" },
    ] satisfies Aba[] : []),
    { k: "ajuda", t: "Ajuda", icon: "LifeBuoy" },
  ];
  const abaConta: Aba = { k: "conta", t: "Minha conta", icon: "UserCog" };
  const aba = resolverAba(pedida === "conta" ? [abaConta, ...abas] : abas, pedida);

  const sub: Record<string, string> = {
    envio: "Dias e horários em que o robô pode enviar.",
    chips: "Os números de WhatsApp por onde ele conversa.",
    modelos: "Os textos que a Meta precisa aprovar para o robô abrir conversa.",
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
      {aba === "modelos" && <Modelos sessao={sessao} />}
      {aba === "integracoes" && <Integracoes sessao={sessao} />}
      {aba === "equipe" && <Equipe sessao={sessao} />}
      {aba === "conta" && <Conta />}
      {aba === "ajuda" && <Ajuda />}
    </>
  );
}
