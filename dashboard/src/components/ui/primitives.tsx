import * as React from "react";
import { cn } from "@/lib/utils";

// Tooltip/HelpHint vivem num módulo client (portal) para escapar do
// overflow-hidden dos cards. Reexportados aqui por compatibilidade de imports.
export { Tooltip, HelpHint } from "./tooltip";

export function Card({ className, glow, ...props }: React.HTMLAttributes<HTMLDivElement> & { glow?: boolean }) {
  return (
    <div
      className={cn("card-surface relative overflow-hidden p-5", glow && "glow-ring", className)}
      {...props}
    />
  );
}

type Variante = "primary" | "ghost" | "outline" | "danger" | "quiet";

export const estiloBotao = (variant: Variante = "primary", size: "sm" | "md" | "lg" = "md") =>
  cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-botao font-600 whitespace-nowrap",
    "transition-[transform,background-color,border-color,color] duration-150 ease-saida active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-45",
    {
      primary: "bg-tinta text-sobre-tinta hover:bg-ouro",
      outline: "border border-pauta-forte bg-folha text-tinta hover:border-tinta/50 hover:bg-tinta-clara",
      ghost: "text-lapis hover:bg-ink-800 hover:text-texto",
      quiet: "text-tinta hover:bg-tinta-clara",
      danger: "border border-margem/35 bg-margem-fundo text-margem hover:border-margem/60",
    }[variant],
    {
      sm: "alvo-toque h-8 px-3 text-sm2",
      md: "h-10 px-4 text-[0.9375rem] [@media(pointer:coarse)]:h-11",
      lg: "h-12 px-5 text-corpo",
    }[size],
  );

export function Button({
  className, variant = "primary", size = "md", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variante;
  size?: "sm" | "md" | "lg";
}) {
  return <button className={cn(estiloBotao(variant, size), className)} {...props} />;
}

export type Tom = "neutral" | "green" | "violet" | "amber" | "rose" | "blue" | "tinta";

export function Badge({ tone = "neutral", children, className }: {
  tone?: Tom; children: React.ReactNode; className?: string;
}) {
  const tones: Record<Tom, string> = {
    neutral: "text-lapis",
    green: "text-pago",
    violet: "text-violet",
    amber: "text-atencao",
    rose: "text-margem",
    blue: "text-tinta",
    tinta: "text-tinta",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-meta font-600", tones[tone], className)}>
      {children}
    </span>
  );
}

const campo =
  "w-full rounded-controle border border-pauta-forte bg-folha text-[0.9375rem] text-texto placeholder:text-lapis/70 " +
  "outline-none transition-[border-color,box-shadow] duration-150 focus:border-tinta focus:ring-2 focus:ring-tinta/15 " +
  "disabled:bg-ink-800 disabled:text-lapis";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(campo, "h-10 px-3 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:text-base", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm2 font-600 text-texto", className)} {...props} />;
}

export function Switch({ checked, onChange, size = "md", label }: {
  checked: boolean; onChange: (v: boolean) => void; size?: "md" | "lg"; label?: string;
}) {
  const dims = size === "lg"
    ? { w: "w-14", h: "h-8", knob: "h-6 w-6", on: "translate-x-6" }
    : { w: "w-11", h: "h-6", knob: "h-4 w-4", on: "translate-x-5" };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "alvo-toque relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-200",
        dims.w, dims.h,
        checked ? "border-tinta bg-tinta" : "border-pauta-forte bg-ink-700",
      )}
    >
      <span
        className={cn(
          "ml-[3px] inline-block rounded-full bg-white shadow-sobe transition-transform duration-200 ease-saida",
          dims.knob,
          checked ? dims.on : "translate-x-0",
        )}
      />
    </button>
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(campo, "px-3 py-2.5 leading-6 [@media(pointer:coarse)]:text-base", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(campo, "h-10 px-2.5 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:text-base", className)} {...props} />;
}

export function SectionTitle({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-pagina font-600 text-ouro">{title}</h1>
        {sub && <p className="mt-1 text-[0.9375rem] text-lapis">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
