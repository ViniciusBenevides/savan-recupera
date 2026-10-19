"use client";
import "./globals.css";
import { useEffect } from "react";
import { Button } from "@/components/ui/primitives";

// Quando até o layout raiz falha, o Next troca a página inteira por esta. As fontes do layout não
// carregam aqui (os títulos caem na Georgia), mas as cores e o caminho de volta continuam.
export default function ErroGeral({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <main className="grid min-h-screen place-items-center bg-papel px-4">
          <div role="alert" className="w-full max-w-[420px] rounded-painel border border-pauta bg-folha px-6 py-7">
            <h1 className="font-display text-titulo font-600 text-ouro">O sistema não abriu</h1>
            <p className="mt-2 text-[0.9375rem] text-lapis">
              Pode ser a internet ou o servidor. Tente de novo; se continuar, avise o suporte
              {error.digest ? <> com o código <span className="font-mono">{error.digest}</span></> : null}.
            </p>
            <Button className="mt-5" onClick={reset}>Tentar de novo</Button>
          </div>
        </main>
      </body>
    </html>
  );
}
