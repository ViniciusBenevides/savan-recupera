"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, ListChecks, MessagesSquare, CalendarDays, Users, Wallet, Handshake, FolderOpen, Landmark, BarChart3, Settings2, Menu, X,
} from "lucide-react";
import { Logo } from "@/components/Brand";
import { cn } from "@/lib/utils";

// O menu é o do MC COB V5 que o Maurelio usa, com os nomes e a ordem dele (Painel, Central / Agenda,
// Trabalho de Hoje, Minha Carteira, Devedores / Processos…). Saíram só os que são outro negócio
// (Precatórios, Compradores) e os que ainda não existem aqui (Jurídico).
type Item = { href: string; label: string; curto?: string; icon: typeof ListChecks; roles: string[]; contador?: "conversas" | "agenda" };
const OPERA = ["admin", "cobrador", "negociador", "visualizador"];
const DONO = ["admin", "cobrador", "credor", "visualizador"];
const grupos: { titulo: string; itens: Item[] }[] = [
  {
    titulo: "Visão geral",
    itens: [
      { href: "/", label: "Painel", icon: LayoutDashboard, roles: [...OPERA, "credor"] },
      { href: "/agenda", label: "Central / Agenda", curto: "Agenda", icon: CalendarDays, roles: OPERA, contador: "agenda" },
    ],
  },
  {
    titulo: "Operação",
    itens: [
      { href: "/trabalho-hoje", label: "Trabalho de Hoje", curto: "Hoje", icon: ListChecks, roles: OPERA },
      { href: "/devedores?aba=minha", label: "Minha Carteira", icon: Wallet, roles: OPERA },
      { href: "/devedores", label: "Devedores / Processos", curto: "Devedores", icon: Users, roles: [...OPERA, "credor"] },
      { href: "/acordos", label: "Negociações e Acordos", curto: "Acordos", icon: Handshake, roles: [...OPERA, "credor"] },
      { href: "/carteiras", label: "Credores / Carteiras", icon: FolderOpen, roles: DONO },
    ],
  },
  {
    titulo: "Inteligência",
    itens: [
      { href: "/conversas", label: "Mensagens WhatsApp", curto: "WhatsApp", icon: MessagesSquare, roles: OPERA, contador: "conversas" },
      { href: "/relatorios", label: "Relatórios & BI", icon: BarChart3, roles: [...DONO, "negociador"] },
    ],
  },
  {
    titulo: "Especialidades",
    itens: [{ href: "/financeiro", label: "Financeiro", icon: Landmark, roles: DONO }],
  },
];
const ajustes: Item = { href: "/ajustes", label: "Configurações", icon: Settings2, roles: [...OPERA, "credor"] };
// No celular, a barra de baixo leva ao que se usa o dia inteiro; o resto fica em "Menu".
const NA_BARRA = ["/trabalho-hoje", "/conversas", "/agenda", "/"];

export type Contadores = { conversas: number; agenda: number };

// "Minha Carteira" e "Devedores / Processos" são a mesma tela com abas diferentes: a aba decide qual acende.
function ativoEm(path: string, aba: string | null, href: string) {
  if (href === "/") return path === "/";
  if (href === "/devedores?aba=minha") return path === "/devedores" && aba === "minha";
  if (href === "/devedores") return path.startsWith("/devedores") && aba !== "minha";
  return path === href || path.startsWith(href + "/");
}

function LinkCapa({ item, path, aba, contadores }: { item: Item; path: string; aba: string | null; contadores: Contadores }) {
  const ativo = ativoEm(path, aba, item.href);
  const n = item.contador ? contadores[item.contador] : 0;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-controle pl-3 pr-3 text-[0.9375rem] transition-colors duration-150 [@media(pointer:coarse)]:h-11",
        ativo ? "nav-ativo font-700 text-ouro" : "font-500 text-capa-texto/85 hover:bg-capa-escura hover:text-capa-texto",
      )}
    >
      <Icon className={cn("h-[1.125rem] w-[1.125rem] shrink-0", ativo ? "text-ouro" : "text-tinta/80 group-hover:text-tinta")} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
      {n > 0 && (
        <span
          className={cn(
            "ml-auto min-w-6 rounded-full px-1.5 text-center font-mono text-meta font-600",
            ativo ? "bg-tinta text-sobre-tinta" : "bg-white/10 text-capa-texto",
          )}
        >
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}

function Grupos({ visiveis, path, aba, contadores }: { visiveis: { titulo: string; itens: Item[] }[]; path: string; aba: string | null; contadores: Contadores }) {
  return (
    <>
      {visiveis.map((g) => (
        <div key={g.titulo} className="flex flex-col gap-0.5">
          <p className="mb-1 pl-3 text-meta font-600 text-capa-apagado">{g.titulo}</p>
          {g.itens.map((i) => <LinkCapa key={i.href} item={i} path={path} aba={aba} contadores={contadores} />)}
        </div>
      ))}
    </>
  );
}

export function Sidebar({ role, contadores }: { role: string; contadores: Contadores }) {
  const path = usePathname();
  const aba = useSearchParams().get("aba");
  const [aberto, setAberto] = useState(false);
  useEffect(() => setAberto(false), [path, aba]);
  useEffect(() => {
    if (!aberto) return;
    const fecharNoEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", fecharNoEsc);
    return () => window.removeEventListener("keydown", fecharNoEsc);
  }, [aberto]);

  const visiveis = grupos
    .map((g) => ({ ...g, itens: g.itens.filter((i) => i.roles.includes(role)) }))
    .filter((g) => g.itens.length);
  const todos = visiveis.flatMap((g) => g.itens);
  const barra = NA_BARRA.map((h) => todos.find((i) => i.href === h)).filter((i): i is Item => !!i);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[17rem] shrink-0 flex-col border-r border-pauta bg-capa pb-3 pl-3 pr-3 pt-3 lg:flex">
        <Link href="/" className="mb-3 flex justify-center rounded-controle focus-visible:outline-tinta" aria-label="Painel MC COB">
          <Logo largura={150} />
        </Link>
        <nav aria-label="Navegação principal" className="sem-barra flex flex-1 flex-col gap-3 overflow-y-auto">
          <Grupos visiveis={visiveis} path={path} aba={aba} contadores={contadores} />
        </nav>
        {ajustes.roles.includes(role) && (
          <div className="border-t border-pauta pt-3">
            <LinkCapa item={ajustes} path={path} aba={aba} contadores={contadores} />
          </div>
        )}
      </aside>

      {/* Celular: o que se usa o dia inteiro na barra de baixo; o resto em "Menu" */}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-pauta bg-capa px-1 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-1.5 lg:hidden"
      >
        {barra.map((item) => {
          const ativo = ativoEm(path, aba, item.href);
          const n = item.contador ? contadores[item.contador] : 0;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-controle text-[0.75rem] font-600",
                ativo ? "text-ouro" : "text-capa-apagado",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="max-w-full truncate px-0.5">{item.curto ?? item.label}</span>
              {n > 0 && <span className="absolute right-[22%] top-0.5 h-2 w-2 rounded-full bg-margem" aria-label={`${n} pendentes`} />}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-controle text-[0.75rem] font-600 text-capa-apagado"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
          Menu
        </button>
      </nav>

      {aberto && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/60" onClick={() => setAberto(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-[320px] animate-fade-up flex-col border-r border-pauta bg-capa pb-[env(safe-area-inset-bottom)] pl-3 pr-3 pt-4">
            <div className="mb-5 flex items-start justify-between">
              <Link href="/" onClick={() => setAberto(false)} className="rounded-controle focus-visible:outline-tinta" aria-label="Painel MC COB">
                <Logo />
              </Link>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar menu" className="grid h-11 w-11 place-items-center rounded-controle text-capa-texto hover:bg-capa-escura">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
              <Grupos visiveis={visiveis} path={path} aba={aba} contadores={contadores} />
              {ajustes.roles.includes(role) && <LinkCapa item={ajustes} path={path} aba={aba} contadores={contadores} />}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
