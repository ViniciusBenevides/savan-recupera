import Link from "next/link";

export const metadata = { title: "Página não encontrada" };

// Link velho, endereço digitado errado ou devedor apagado: a pessoa precisa de um caminho de volta,
// não da página em inglês do Next.
export default function NaoEncontrada() {
  return (
    <main className="grid min-h-screen place-items-center bg-papel px-4">
      <div className="w-full max-w-[420px] rounded-painel border border-pauta bg-folha px-6 py-7">
        <h1 className="font-display text-titulo font-600 text-ouro">Esta página não existe</h1>
        <p className="mt-2 text-[0.9375rem] text-lapis">O endereço pode estar errado ou o que ele mostrava foi apagado.</p>
        <Link href="/trabalho-hoje" className="mt-5 inline-flex h-10 items-center rounded-botao bg-tinta px-4 text-[0.9375rem] font-600 text-sobre-tinta transition-transform duration-150 ease-saida active:scale-[0.97]">
          Ir para o Trabalho de hoje
        </Link>
      </div>
    </main>
  );
}
