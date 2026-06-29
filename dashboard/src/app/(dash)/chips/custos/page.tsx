import Link from "next/link";
import { SectionTitle, Button } from "@/components/ui/primitives";
import { CalculadoraCusto } from "@/components/CalculadoraCusto";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default function CustosPage() {
  return (
    <>
      <SectionTitle
        title="Custos — Z-API × Meta oficial"
        sub="Compare o custo mensal dos dois conectores no seu cenário de envio."
        action={<Link href="/chips"><Button variant="outline"><ArrowLeft className="h-4 w-4" /> Voltar</Button></Link>}
      />
      <CalculadoraCusto />
    </>
  );
}
