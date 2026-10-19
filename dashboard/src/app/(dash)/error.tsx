"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/primitives";

// Falha ao carregar uma tela do painel (banco fora, sessão expirada no meio, bug): fica a barra lateral,
// some o erro técnico, e a pessoa pode tentar de novo sem perder o lugar.
export default function ErroDoPainel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div role="alert" className="max-w-[560px] rounded-painel border border-pauta bg-folha px-5 py-6">
        <h1 className="font-display text-titulo font-600 text-ouro">Não foi possível abrir esta tela</h1>
        <p className="mt-1 text-[0.9375rem] text-lapis">
          Pode ser a internet ou o servidor. Nada do que você já registrou se perdeu. Tente de novo; se continuar,
          avise o suporte{error.digest ? <> com o código <span className="font-mono">{error.digest}</span></> : null}.
        </p>
        <Button className="mt-4" onClick={reset}>Tentar de novo</Button>
      </div>
    </div>
  );
}
