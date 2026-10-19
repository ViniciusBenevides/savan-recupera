"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, LogOut, UserRound, LifeBuoy } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

// Barra de cima: a busca do MC COB ("Buscar devedor, processo, CPF/CNPJ, telefone…") e quem está logado.
export function Topbar({ nome, papel, demo }: { nome: string; papel: string; demo: boolean }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const busca = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setMenu(false);
    }
    function atalho(e: KeyboardEvent) {
      if (e.key === "/" && !(e.target as HTMLElement)?.closest("input, textarea, [contenteditable]")) {
        e.preventDefault();
        busca.current?.focus();
      }
      if (e.key === "Escape") setMenu(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", atalho);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", atalho);
    };
  }, []);

  async function sair() {
    await supabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="sticky top-0 z-30">
    <header className="flex h-16 items-center gap-3 border-b border-pauta bg-folha/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
      <form action="/devedores" className="relative min-w-[11rem] flex-1 sm:max-w-[32.5rem]" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lapis" aria-hidden="true" />
        <input
          ref={busca}
          name="q"
          type="search"
          autoComplete="off"
          aria-label="Buscar devedor"
          placeholder="Buscar devedor, CPF, processo ou telefone"
          className="h-10 w-full rounded-controle border border-pauta-forte bg-folha pl-9 pr-10 text-[0.9375rem] text-texto outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-lapis/80 focus:border-tinta focus:ring-2 focus:ring-tinta/15 [@media(pointer:coarse)]:text-base"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-pauta px-1.5 font-mono text-meta text-lapis sm:block">/</kbd>
      </form>

      {demo && (
        <span className="hidden min-w-0 truncate rounded-controle border border-atencao/30 bg-atencao-fundo px-2.5 py-1 text-meta font-600 text-atencao md:inline-block" title="Dados de demonstração">
          Dados de demonstração
        </span>
      )}

      <div ref={caixa} className="relative ml-auto shrink-0">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          aria-expanded={menu}
          aria-haspopup="menu"
          className="flex h-10 items-center gap-2.5 rounded-controle pl-1 pr-2 transition-colors hover:bg-ink-800 [@media(pointer:coarse)]:h-11"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-tinta-clara font-700 text-tinta">{nome.charAt(0).toUpperCase()}</span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block max-w-[10rem] truncate text-sm2 font-600 text-texto" title={nome}>{nome}</span>
            <span className="block text-meta text-lapis">{papel}</span>
          </span>
        </button>
        {menu && (
          <div
            role="menu"
            className="absolute right-0 top-12 w-56 origin-top-right animate-surgir rounded-painel border border-pauta bg-folha p-1.5 shadow-flutua"
          >
            <MenuLink href="/ajustes?aba=conta" icon={UserRound}>Minha conta</MenuLink>
            <MenuLink href="/ajustes?aba=ajuda" icon={LifeBuoy}>Ajuda</MenuLink>
            <div className="my-1 h-px bg-pauta" />
            <button
              role="menuitem"
              type="button"
              onClick={sair}
              className="flex h-10 w-full items-center gap-2.5 rounded-controle px-2.5 text-[0.9375rem] text-texto hover:bg-margem-fundo hover:text-margem"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
            </button>
          </div>
        )}
      </div>
    </header>
    {/* No celular a etiqueta não cabe ao lado da busca: vira uma faixa fina logo abaixo, sempre à vista */}
    {demo && (
      <p className="border-b border-atencao/30 bg-atencao-fundo px-4 py-1 text-center text-meta font-600 text-atencao md:hidden">
        Dados de demonstração: nada aqui é real
      </p>
    )}
    </div>
  );
}

function MenuLink({ href, icon: Icon, children }: { href: string; icon: typeof UserRound; children: React.ReactNode }) {
  return (
    <Link role="menuitem" href={href} className={cn("flex h-10 items-center gap-2.5 rounded-controle px-2.5 text-[0.9375rem] text-texto hover:bg-ink-800")}>
      <Icon className="h-4 w-4 text-lapis" aria-hidden="true" /> {children}
    </Link>
  );
}
