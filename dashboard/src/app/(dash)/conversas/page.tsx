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

  // O canal oficial da Meta acabou em 17/08/2026 (§38); hoje quem conversa são os números comuns.
  // O filtro do topo mostra qual número ATENDE cada conversa agora — não quem mandou as mensagens
  // antigas, que continuam com o número de origem no rodapé de cada balão.
  return (
    <>
      <SectionTitle
        title="Conversas"
        sub={aba === "escaladas"
          ? "Casos que o robô passou para atendimento humano — com histórico, status e desfecho."
          : podeAtender
            ? "A operação real — leia e responda por aqui. O filtro do topo é o número que atende hoje, não quem mandou o histórico. Conversas de teste ficam ocultas até você pedir."
            : "A operação real. O filtro do topo é o número que atende hoje, não quem mandou o histórico. Conversas de teste ficam ocultas até você pedir."}
      />

      <Abas abas={abas} atual={aba} />

      {aba === "todas" && <Dialogos podeAtender={podeAtender} />}
      {aba === "escaladas" && <Escaladas />}
    </>
  );
}
