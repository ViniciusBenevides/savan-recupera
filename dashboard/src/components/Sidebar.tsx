"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, ListChecks, MessagesSquare, CalendarDays, Search, Bot, Activity, ChevronDown, Menu, X } from "lucide-react";
import { Logo } from "@/components/Brand";
import { cn } from "@/lib/utils";

// O menu é o da "interface simples" do MC COB V5.9.02: em cima, o que se usa todo dia ("Comece
// aqui"); embaixo, o resto em grupos que abrem e fecham. Saíram só os que são outro negócio
// (Precatórios, Compradores) e os que ainda não existem aqui (Bancos / cobranças, Telegram).
type Item = { href: string; label: string; curto?: string; icon?: typeof ListChecks; roles: string[]; contador?: "conversas" | "agenda" };
type Grupo = { id: string; titulo: string; itens: Item[] };

const OPERA = ["admin", "cobrador", "negociador", "visualizador"];
const DONO = ["admin", "cobrador", "credor", "visualizador"];
const CONFIGURA = ["admin", "cobrador"];

const comece: Item[] = [
  { href: "/", label: "Início", icon: Home, roles: [...OPERA, "credor"] },
  { href: "/trabalho-hoje", label: "Trabalho de hoje", curto: "Hoje", icon: ListChecks, roles: OPERA },
  { href: "/conversas", label: "Mensagens WhatsApp", curto: "WhatsApp", icon: MessagesSquare, roles: OPERA, contador: "conversas" },
  { href: "/disparos", label: "Disparos e automação", icon: Bot, roles: [...CONFIGURA, "visualizador"] },
  { href: "/devedores", label: "Buscar devedores", icon: Search, roles: [...OPERA, "credor"] },
  { href: "/recuperacao", label: "Central de recuperação", icon: Activity, roles: OPERA },
];
const grupos: Grupo[] = [
  {
    id: "carteiras",
    titulo: "Carteiras e atendimento",
    itens: [
      { href: "/devedores?aba=minha", label: "Minha carteira", roles: OPERA },
      { href: "/carteiras", label: "Credores / carteiras", roles: DONO },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, roles: OPERA, contador: "agenda" },
      { href: "/acordos", label: "Negociações e acordos", roles: [...OPERA, "credor"] },
    ],
  },
  {
    id: "financeiro",
    titulo: "Financeiro e jurídico",
    itens: [
      { href: "/financeiro", label: "Financeiro", roles: DONO },
      { href: "/relatorios", label: "Relatórios & BI", roles: [...DONO, "negociador"] },
      { href: "/juridico", label: "Jurídico", roles: OPERA },
      { href: "/atraso", label: "Atraso / prescrição", roles: OPERA },
    ],
  },
  {
    id: "administracao",
    titulo: "Administração",
    itens: [
      { href: "/ajustes?aba=equipe", label: "Usuários e acessos", roles: CONFIGURA },
      { href: "/ajustes?aba=chips", label: "Linhas WhatsApp", roles: CONFIGURA },
      { href: "/ajustes", label: "Configurações", roles: [...OPERA, "credor"] },
    ],
  },
];
// No celular, a barra de baixo leva ao que se usa o dia inteiro; o resto fica em "Menu".
const NA_BARRA = ["/trabalho-hoje", "/conversas", "/agenda", "/"];
const GUARDA = "mc-cob:menu";

export type Contadores = { conversas: number; agenda: number };

// Telas que dividem a mesma rota (Minha carteira e Buscar devedores; as abas de Configurações):
// quem decide qual item acende é a aba da URL.
function ativoEm(path: string, aba: string | null, href: string) {
  if (href === "/") return path === "/";
  if (href === "/devedores?aba=minha") return path === "/devedores" && aba === "minha";
  if (href === "/devedores") return path.startsWith("/devedores") && aba !== "minha";
  if (href === "/ajustes?aba=equipe") return path === "/ajustes" && aba === "equipe";
  if (href === "/ajustes?aba=chips") return (path === "/ajustes" && aba === "chips") || path.startsWith("/chips");
  if (href === "/ajustes") return path === "/ajustes" && aba !== "equipe" && aba !== "chips";
  return path === href || path.startsWith(href + "/");
}

function Contador({ n, ativo }: { n: number; ativo: boolean }) {
  if (n <= 0) return null;
  return (
    <span className={cn("ml-auto min-w-6 shrink-0 rounded-full px-1.5 text-center font-mono text-meta font-600", ativo ? "bg-tinta text-sobre-tinta" : "bg-white/10 text-capa-texto")}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function LinkCapa({ item, path, aba, contadores, dentro = false }: { item: Item; path: string; aba: string | null; contadores: Contadores; dentro?: boolean }) {
  const ativo = ativoEm(path, aba, item.href);
  const n = item.contador ? contadores[item.contador] : 0;
  const Icon = dentro ? undefined : item.icon;
  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-controle pr-3 text-[0.9375rem] transition-colors duration-150 [@media(pointer:coarse)]:h-11",
        dentro ? "pl-[2.625rem]" : "pl-3",
        ativo ? "nav-ativo font-700 text-ouro" : "font-500 text-capa-texto/85 hover:bg-capa-escura hover:text-capa-texto",
      )}
    >
      {Icon && <Icon className={cn("h-[1.125rem] w-[1.125rem] shrink-0", ativo ? "text-ouro" : "text-tinta/80 group-hover:text-tinta")} aria-hidden="true" />}
      <span className="truncate">{item.label}</span>
      <Contador n={n} ativo={ativo} />
    </Link>
  );
}

function GrupoRecolhivel({ g, aberto, alternar, animar, path, aba, contadores }: {
  g: Grupo; aberto: boolean; alternar: () => void; animar: boolean; path: string; aba: string | null; contadores: Contadores;
}) {
  const temAtivo = g.itens.some((i) => ativoEm(path, aba, i.href));
  const pendentes = g.itens.reduce((s, i) => s + (i.contador ? contadores[i.contador] : 0), 0);
  return (
    <div>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberto}
        aria-controls={`menu-${g.id}`}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-controle pl-3 pr-2 text-left text-sm2 font-600 transition-colors duration-150 hover:bg-capa-escura hover:text-capa-texto [@media(pointer:coarse)]:h-11",
          temAtivo && !aberto ? "text-ouro" : "text-capa-apagado",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{g.titulo}</span>
        {/* Fechado, o grupo não esconde o que está pendente lá dentro */}
        {!aberto && <Contador n={pendentes} ativo={false} />}
        <ChevronDown className={cn("h-4 w-4 shrink-0 ease-saida", animar && "transition-transform duration-200", aberto && "rotate-180")} aria-hidden="true" />
      </button>
      <div
        id={`menu-${g.id}`}
        className={cn(
          "grid ease-saida motion-reduce:transition-none",
          animar && "transition-[grid-template-rows,visibility] duration-200",
          aberto ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]",
        )}
      >
        <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
          {g.itens.map((i) => <LinkCapa key={i.href} item={i} path={path} aba={aba} contadores={contadores} dentro />)}
        </div>
      </div>
    </div>
  );
}

function Menu_({ role, path, aba, contadores, tudoAberto = false }: { role: string; path: string; aba: string | null; contadores: Contadores; tudoAberto?: boolean }) {
  const principais = comece.filter((i) => i.roles.includes(role));
  const visiveis = grupos.map((g) => ({ ...g, itens: g.itens.filter((i) => i.roles.includes(role)) })).filter((g) => g.itens.length);
  const grupoAtivo = visiveis.find((g) => g.itens.some((i) => ativoEm(path, aba, i.href)))?.id ?? null;

  // Abre sozinho o grupo da tela em que a pessoa está; o que ela abriu ou fechou fica guardado.
  const [escolha, setEscolha] = useState<Record<string, boolean>>({});
  const [animar, setAnimar] = useState(false);
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(GUARDA) ?? "{}");
      if (salvo && typeof salvo === "object") setEscolha(salvo);
    } catch { /* navegador sem armazenamento: o menu funciona do mesmo jeito */ }
    const t = requestAnimationFrame(() => setAnimar(true));
    return () => cancelAnimationFrame(t);
  }, []);
  useEffect(() => {
    if (grupoAtivo) setEscolha((e) => (e[grupoAtivo] === false ? { ...e, [grupoAtivo]: true } : e));
  }, [grupoAtivo, path, aba]);

  function alternar(id: string, abertoAgora: boolean) {
    setEscolha((e) => {
      const novo = { ...e, [id]: !abertoAgora };
      try { localStorage.setItem(GUARDA, JSON.stringify(novo)); } catch { /* sem armazenamento */ }
      return novo;
    });
  }

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <p className="mb-1 pl-3 text-meta font-600 text-capa-apagado">Comece aqui</p>
        {principais.map((i) => <LinkCapa key={i.href} item={i} path={path} aba={aba} contadores={contadores} />)}
      </div>
      <div className="flex flex-col gap-1 border-t border-pauta pt-3">
        {visiveis.map((g) => {
          const aberto = tudoAberto || (escolha[g.id] ?? g.id === grupoAtivo);
          return (
            <GrupoRecolhivel key={g.id} g={g} aberto={aberto} animar={animar && !tudoAberto} path={path} aba={aba} contadores={contadores}
              alternar={() => { if (!tudoAberto) alternar(g.id, aberto); }} />
          );
        })}
      </div>
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

  const todos = [...comece, ...grupos.flatMap((g) => g.itens)].filter((i) => i.roles.includes(role));
  const barra = NA_BARRA.map((h) => todos.find((i) => i.href === h)).filter((i): i is Item => !!i && !!i.icon);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[17rem] shrink-0 flex-col border-r border-pauta bg-capa pb-3 pl-3 pr-3 pt-3 lg:flex">
        <Link href="/" className="mb-3 flex justify-center rounded-controle focus-visible:outline-tinta" aria-label="Início do MC COB">
          <Logo largura={150} />
        </Link>
        <nav aria-label="Navegação principal" className="sem-barra flex flex-1 flex-col gap-3 overflow-y-auto">
          <Menu_ role={role} path={path} aba={aba} contadores={contadores} />
        </nav>
      </aside>

      {/* Celular: o que se usa o dia inteiro na barra de baixo; o resto em "Menu" */}
      <nav
        aria-label="Atalhos"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-pauta bg-capa px-1 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-1.5 lg:hidden"
      >
        {barra.map((item) => {
          const ativo = ativoEm(path, aba, item.href);
          const n = item.contador ? contadores[item.contador] : 0;
          const Icon = item.icon!;
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
          aria-haspopup="dialog"
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
              <Link href="/" onClick={() => setAberto(false)} className="rounded-controle focus-visible:outline-tinta" aria-label="Início do MC COB">
                <Logo />
              </Link>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar menu" className="grid h-11 w-11 place-items-center rounded-controle text-capa-texto hover:bg-capa-escura">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* No celular a gaveta já é o "resto": os grupos ficam abertos, sem mais um toque para ver */}
            <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-4 overflow-y-auto pb-4">
              <Menu_ role={role} path={path} aba={aba} contadores={contadores} tudoAberto />
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
