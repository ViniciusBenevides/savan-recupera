import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { getConfigEscopo } from "@/lib/config";
import type { Escopo } from "@/lib/auth";
import { Power } from "lucide-react";
import { RegrasEnvio } from "./regras-envio";

/** Aba "Envio" — as regras que o disparador obedece. Era a página Campanha. */
export async function Envio({ escopo, conta }: { escopo: Escopo; conta?: string }) {
  const cfg = await getConfigEscopo(escopo.cobradorId);

  return (
    <>
      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-ink-850/50">
        <p className="text-sm text-mist">
          Aqui ficam as regras: <b className="text-chalk">quando</b> e em que <b className="text-chalk">ritmo</b> o robô envia.
          Ligar e desligar a campanha é no Início.
        </p>
        <Link href="/" className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-emerald hover:underline">
          <Power className="h-3.5 w-3.5" /> Ir para a chave da campanha
        </Link>
      </Card>

      <RegrasEnvio
        cfg={cfg}
        conta={escopo.cobradorId ? conta ?? "" : "global"}
        ehGlobal={escopo.ehGlobal}
      />
    </>
  );
}
