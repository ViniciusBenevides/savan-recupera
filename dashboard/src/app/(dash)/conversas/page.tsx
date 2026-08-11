import { SectionTitle } from "@/components/ui/primitives";
import { Abas } from "@/components/Abas";
import { resolverAba, type Aba } from "@/lib/abas";
import { getSessao } from "@/lib/auth";
import { Dialogos } from "./_secoes/dialogos";
import { Escaladas, contarEscalacoesAbertas } from "./_secoes/escaladas";

export const dynamic = "force-dynamic";

// Conversas = "o que está acontecendo agora?". Escalações eram um menu à parte, mas são a
// MESMA conversa no momento em que o robô entregou o caso a um humano — viraram uma aba.
export default async function ConversasPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba: pedida } = await searchParams;
  const sessao = await getSessao();
  const podeAtender = !!sessao && ["admin", "cobrador"].includes(sessao.role);

  const abertas = podeAtender ? await contarEscalacoesAbertas() : 0;
  const abas : Aba[] = [
    { k: "todas", t: "Todas", icon: "MessagesSquare" },
    ...(podeAtender
      ? [{ k: "escaladas", t: abertas > 0 ? `Precisam de você (${abertas})` : "Precisam de você", icon: "Headset" } as Aba]
      : []),
  ];
  const aba = resolverAba(abas, pedida);

  return (
    <>
      <SectionTitle
        title="Conversas"
        sub={aba === "escaladas"
          ? "Casos que o robô passou para atendimento humano — com histórico, status e desfecho."
          : "A operação real do número oficial. Conversas de teste ficam ocultas até você pedir."}
      />

      <Abas abas={abas} atual={aba} />

      {aba === "todas" && <Dialogos />}
      {aba === "escaladas" && <Escaladas />}
    </>
  );
}
