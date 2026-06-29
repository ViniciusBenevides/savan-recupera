import { SectionTitle } from "@/components/ui/primitives";
import { TemplatesManager } from "./manager";

export const dynamic = "force-dynamic";

export default async function TemplatesMetaPage({ searchParams }: { searchParams: Promise<{ conta?: string }> }) {
  const { conta } = await searchParams;
  return (
    <>
      <SectionTitle
        title="Templates WhatsApp (Meta)"
        sub="Modelos aprovados pela Meta para o 1º contato (cobrança fria) pelos números oficiais."
      />
      <TemplatesManager conta={conta ?? null} />
    </>
  );
}
