import { Suspense } from "react";
import { SectionTitle } from "@/components/ui/primitives";
import { NovoChipFlow } from "./flow";
import { linhasLiberadas } from "@/lib/linhas";

export const dynamic = "force-dynamic";

export default function NovoChipPage() {
  return (
    <>
      <SectionTitle title="Adicionar linha" sub="Um número comum de WhatsApp, vinculado por QR. Tenha o celular dele em mãos." />
      <Suspense fallback={<div className="text-sm text-mist">Carregando…</div>}>
        <NovoChipFlow linhasLiberadas={linhasLiberadas()} />
      </Suspense>
    </>
  );
}
