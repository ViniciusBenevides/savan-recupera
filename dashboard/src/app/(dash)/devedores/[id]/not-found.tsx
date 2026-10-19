import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Ficha que não existe (id errado, devedor apagado ou de uma carteira que você não vê): fica dentro do
// painel, com a barra lateral, e leva de volta para a lista.
export default function DevedorNaoEncontrado() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-5 sm:px-6 lg:px-8">
      <Link href="/devedores" className="inline-flex h-9 items-center gap-1.5 rounded-controle pr-2 text-sm2 font-600 text-tinta hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Devedores
      </Link>
      <div className="mt-4 max-w-[560px] rounded-painel border border-pauta bg-folha px-5 py-6">
        <h1 className="font-display text-titulo font-600 text-ouro">Devedor não encontrado</h1>
        <p className="mt-1 text-[0.9375rem] text-lapis">
          O link pode estar errado, o devedor pode ter sido apagado ou ser de uma carteira que você não acompanha.
          Procure pelo nome, CPF ou telefone na busca lá em cima.
        </p>
      </div>
    </div>
  );
}
