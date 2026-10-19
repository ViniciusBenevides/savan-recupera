import { SectionTitle } from "@/components/ui/primitives";
import { Abas } from "@/components/Abas";
import { resolverAba, type Aba } from "@/lib/abas";
import { getSessao } from "@/lib/auth";
import { Dialogos } from "./_secoes/dialogos";
import { Escaladas, contarEscalacoesAbertas } from "./_secoes/escaladas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mensagens WhatsApp" };

// Conversas = "o que está acontecendo agora?". Escalações eram um menu à parte, mas são a
// MESMA conversa no momento em que o robô entregou o caso a um humano — viraram uma aba.
export default async function ConversasPage({ searchParams }: { searchParams: Promise<{ aba?: string; c?: string }> }) {
  const { aba: pedida, c } = await searchParams;
  const inicial = Number(c) > 0 ? Number(c) : null;
  const sessao = await getSessao();
  // Quem opera a cobrança atende: admin, o dono da operação e o negociador.
  const podeAtender = !!sessao && ["admin", "cobrador", "negociador"].includes(sessao.role);

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
    <div className="mx-auto w-full max-w-[1680px] px-4 pb-6 pt-6 sm:px-6 lg:px-8">
      <SectionTitle
        title="Mensagens WhatsApp"
        sub={aba === "escaladas"
          ? "Casos que o robô passou para atendimento humano — com histórico, status e desfecho."
          : podeAtender
            ? "Leia e responda por aqui. Quem respondeu por último fica marcado até alguém ler."
            : "As conversas de WhatsApp das suas carteiras."}
      />

      <Abas abas={abas} atual={aba} />

      {aba === "todas" && <Dialogos podeAtender={podeAtender} inicial={inicial} />}
      {aba === "escaladas" && <Escaladas />}
    </div>
  );
}
