"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/primitives";

// Falha fora do painel (a tela de entrar, por exemplo): a mesma cara da página que não existe, com o
// caminho de tentar de novo no lugar da tela branca do Next.
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="grid min-h-screen place-items-center bg-papel px-4">
      <div role="alert" className="w-full max-w-[420px] rounded-painel border border-pauta bg-folha px-6 py-7">
        <h1 className="font-display text-titulo font-600 text-ouro">Não foi possível abrir esta tela</h1>
        <p className="mt-2 text-[0.9375rem] text-lapis">
          Pode ser a internet ou o servidor. Tente de novo; se continuar, avise o suporte
          {error.digest ? <> com o código <span className="font-mono">{error.digest}</span></> : null}.
        </p>
        <Button className="mt-5" onClick={reset}>Tentar de novo</Button>
      </div>
    </main>
  );
}
