import { CASOS } from "@/lib/dev/pior-caso";

// Chave de teste "Dados reais / Pior caso / Vazio / Um só". Só aparece no ambiente de
// desenvolvimento; não é parte do desenho da tela (por isso é cinza e fora da paleta).
export function TrocaDados({ rota, atual }: { rota: string; atual: string | null }) {
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <nav aria-label="Dados de teste" className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 gap-0.5 rounded-full bg-neutral-700 p-0.5 font-sans text-[12px] shadow-lg lg:bottom-4">
      {CASOS.map((c) => (
        <a key={c.k} href={c.k ? `${rota}?dados=${c.k}` : rota}
          className={(atual ?? "") === c.k ? "rounded-full bg-white px-3 py-1 font-semibold text-neutral-900" : "rounded-full px-3 py-1 text-neutral-200 hover:text-white"}>
          {c.t}
        </a>
      ))}
    </nav>
  );
}
