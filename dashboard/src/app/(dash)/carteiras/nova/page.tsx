import { SectionTitle } from "@/components/ui/primitives";
import { NovaCarteiraFlow } from "./flow";

export const dynamic = "force-dynamic";

export default function NovaCarteiraPage() {
  return (
    <>
      <SectionTitle title="Nova carteira" sub="Em 2 passos: dê um nome à carteira e suba a planilha de devedores." />
      <NovaCarteiraFlow />
    </>
  );
}
