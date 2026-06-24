"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Radio, Smartphone, MessageSquareText, Percent,
  Users, BarChart3, Settings, LogOut, HandCoins, FolderUp, LifeBuoy, Headset,
} from "lucide-react";
import { Logo } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

// Cada item declara quais papéis o veem. admin tudo; cobrador o operacional dele;
// credor/visualizador só leitura do andamento (sem chips/campanha/mensagens/config).
const TODOS = ["admin", "cobrador", "credor", "visualizador"];
const nav = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard, roles: TODOS },
  { href: "/carteiras", label: "Carteiras", icon: FolderUp, roles: TODOS },
  { href: "/campanha", label: "Campanha", icon: Radio, roles: ["admin", "cobrador"] },
  { href: "/chips", label: "Chips", icon: Smartphone, roles: ["admin", "cobrador"] },
  { href: "/templates", label: "Mensagens", icon: MessageSquareText, roles: ["admin", "cobrador"] },
  { href: "/descontos", label: "Descontos", icon: Percent, roles: ["admin", "cobrador"] },
  { href: "/devedores", label: "Devedores", icon: Users, roles: TODOS },
  { href: "/escalacoes", label: "Escalações", icon: Headset, roles: ["admin", "cobrador"] },
  { href: "/pagamentos", label: "Pagamentos", icon: HandCoins, roles: TODOS },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, roles: TODOS },
  { href: "/configuracoes", label: "Configurações", icon: Settings, roles: ["admin", "cobrador"] },
  { href: "/ajuda", label: "Ajuda", icon: LifeBuoy, roles: TODOS },
];

export function Sidebar({ nome, role }: { nome: string; role: string }) {
  const path = usePathname();
  const router = useRouter();
  const sb = supabaseBrowser();
  const itens = nav.filter((n) => n.roles.includes(role));

  async function sair() {
    await sb.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-ink-900/60 px-3 py-5 backdrop-blur lg:flex">
      <div className="px-2"><Logo /></div>

      <nav className="mt-8 flex flex-1 flex-col gap-1">
        {itens.map(({ href, label, icon: Icon }) => {
          const ativo = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                ativo ? "bg-ink-800 text-chalk" : "text-mist hover:bg-ink-850 hover:text-chalk",
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", ativo ? "text-emerald" : "text-mist group-hover:text-chalk")} />
              {label}
              {ativo && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald animate-pulseglow" />}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 rounded-xl border border-line bg-ink-850 p-3">
        <div className="flex items-center gap-2.5">
          <Link href="/conta" title="Minha conta" className="grid h-8 w-8 place-items-center rounded-full bg-emerald/15 font-display text-sm font-700 text-emerald hover:bg-emerald/25">
            {nome.charAt(0).toUpperCase()}
          </Link>
          <Link href="/conta" className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-chalk hover:text-emerald">{nome}</div>
            <div className="text-[11px] capitalize text-mist">{role} · minha conta</div>
          </Link>
          <ThemeToggle className="h-8 w-8 rounded-lg border-0" />
          <button onClick={sair} title="Sair" className="rounded-lg p-2 text-mist hover:bg-ink-700 hover:text-rose">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
