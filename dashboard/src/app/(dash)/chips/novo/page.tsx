import { Suspense } from "react";
import { SectionTitle } from "@/components/ui/primitives";
import { NovoChipFlow } from "./flow";

export const dynamic = "force-dynamic";

export default function NovoChipPage() {
  return (
    <>
      <SectionTitle title="Adicionar chip" sub="Cole as credenciais da API oficial da Meta — o número conecta na hora, sem QR." />
      <Suspense fallback={<div className="text-sm text-mist">Carregando…</div>}>
        <NovoChipFlow />
      </Suspense>
    </>
  );
}
