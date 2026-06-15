import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, glow, ...props }: React.HTMLAttributes<HTMLDivElement> & { glow?: boolean }) {
  return (
    <div
      className={cn("card-surface relative overflow-hidden p-5", glow && "glow-ring", className)}
      {...props}
    />
  );
}

export function Button({
  className, variant = "primary", size = "md", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  const variants = {
    primary: "bg-emerald text-ink-950 hover:bg-emerald-soft font-semibold shadow-[0_8px_30px_-12px_rgba(43,217,140,0.7)]",
    ghost: "text-mist hover:text-chalk hover:bg-ink-800",
    outline: "border border-line text-chalk hover:border-ink-500 hover:bg-ink-800",
    danger: "bg-rose/15 text-rose hover:bg-rose/25 border border-rose/30",
  };
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none",
        variants[variant], sizes[size], className,
      )}
      {...props}
    />
  );
}

export function Badge({ tone = "neutral", children, className }: {
  tone?: "neutral" | "green" | "violet" | "amber" | "rose" | "blue"; children: React.ReactNode; className?: string;
}) {
  const tones = {
    neutral: "bg-ink-700 text-mist border-line",
    green: "bg-emerald/12 text-emerald-soft border-emerald/25",
    violet: "bg-violet/12 text-violet border-violet/25",
    amber: "bg-amber/12 text-amber border-amber/25",
    rose: "bg-rose/12 text-rose border-rose/25",
    blue: "bg-[#4C8DFF]/12 text-[#7FB0FF] border-[#4C8DFF]/25",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-line bg-ink-850 px-3.5 text-sm text-chalk placeholder:text-mist/60",
        "outline-none transition-colors focus:border-emerald/60 focus:ring-2 focus:ring-emerald/15",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-xs font-medium text-mist", className)} {...props} />;
}

export function Switch({ checked, onChange, size = "md" }: {
  checked: boolean; onChange: (v: boolean) => void; size?: "md" | "lg";
}) {
  const dims = size === "lg"
    ? { w: "w-16", h: "h-9", knob: "h-7 w-7", on: "translate-x-7" }
    : { w: "w-12", h: "h-7", knob: "h-5 w-5", on: "translate-x-5" };
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-200",
        dims.w, dims.h,
        checked ? "border-emerald/40 bg-emerald/25" : "border-line bg-ink-700",
      )}
    >
      <span
        className={cn(
          "ml-1 inline-block transform rounded-full transition-transform duration-200",
          dims.knob,
          checked ? `${dims.on} bg-emerald` : "translate-x-0 bg-mist",
        )}
      />
    </button>
  );
}

export function SectionTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-700 tracking-tight text-chalk">{title}</h1>
        {sub && <p className="mt-1 text-sm text-mist">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
