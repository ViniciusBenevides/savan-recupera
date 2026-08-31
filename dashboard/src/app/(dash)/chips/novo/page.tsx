import { Suspense } from "react";
import { SectionTitle } from "@/components/ui/primitives";
import { NovoChipFlow } from "./flow";

export const dynamic = "force-dynamic";

export default function NovoChipPage() {
  return (
    <>
      <SectionTitle title="Adicionar chip" sub="Um número comum de WhatsApp, vinculado por QR. Tenha o celular dele em mãos." />
      <Suspense fallback={<div className="text-sm text-mist">Carregando…</div>}>
        <NovoChipFlow />
      </Suspense>
    </>
  );
}
