"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Gauge, HandCoins, LineChart, FolderUp, Users, MessagesSquare, Headset,
  MessageSquareText, Bot, BookOpen, Send, Smartphone, Plug, UserCog, LifeBuoy,
} from "lucide-react";
import type { Aba, NomeIcone } from "@/lib/abas";
import { cn } from "@/lib/utils";

// Os ícones vivem do lado do cliente e as pages escolhem por nome (ver src/lib/abas.ts).
const ICONES: Record<NomeIcone, any> = {
  Gauge, HandCoins, LineChart, FolderUp, Users, MessagesSquare, Headset,
  MessageSquareText, Bot, BookOpen, Send, Smartphone, Plug, UserCog, LifeBuoy,
};

/**
 * Barra de abas dirigida pela URL (`?aba=`). Substitui a antiga sopa de itens de menu:
 * cada área do painel é UMA entrada na sidebar e as subdivisões viram abas aqui dentro.
 * Como o estado mora na URL, cada aba é linkável, volta no botão "voltar" do navegador e
 * continua funcionando em server components (que só leem searchParams.aba).
 */
export function Abas({ abas, atual, className }: { abas: Aba[]; atual: string; className?: string }) {
  const path = usePathname();
  const params = useSearchParams();

  function href(k: string) {
    const q = new URLSearchParams(params.toString());
    if (k === abas[0].k) q.delete("aba"); else q.set("aba", k);
    const s = q.toString();
    return `${path}${s ? `?${s}` : ""}`;
  }

  if (abas.length < 2) return null;

  return (
    <div className={cn("mb-5 -mx-1 overflow-x-auto", className)}>
      <div className="flex w-max min-w-full gap-1 border-b border-line px-1">
        {abas.map(({ k, t, icon }) => {
          const ativo = k === atual;
          const Icone = icon ? ICONES[icon] : null;
          return (
            <Link
              key={k}
              href={href(k)}
              scroll={false}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors",
                ativo
                  ? "border-emerald font-medium text-chalk"
                  : "border-transparent text-mist hover:text-chalk",
              )}
            >
              {Icone && <Icone className={cn("h-4 w-4", ativo && "text-emerald")} />}
              {t}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
