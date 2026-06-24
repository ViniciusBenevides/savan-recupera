"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

// Bolha de ajuda no hover/foco. Renderiza via portal no <body> para NUNCA ser
// recortada pelo `overflow-hidden` dos cards nem ficar atrás por z-index.
// (Tooltip absoluto dentro de um Card com overflow-hidden era cortado — o
//  clipping de overflow ignora z-index, por isso o portal resolve de vez.)
export function Tooltip({ text, children, className }: { text: string; children: React.ReactNode; className?: string }) {
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number; below: boolean }>({ top: 0, left: 0, below: false });

  const place = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = r.top < 88; // sem espaço acima → abre embaixo
    setPos({
      top: below ? r.bottom + 8 : r.top - 8,
      left: r.left + r.width / 2,
      below,
    });
  }, []);

  const show = React.useCallback(() => { place(); setOpen(true); }, [place]);
  const hide = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, place]);

  return (
    <span
      ref={triggerRef}
      className={cn("relative inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              transform: pos.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
            }}
            className="pointer-events-none z-[100] w-max max-w-[260px] rounded-lg border border-line bg-ink-950 px-2.5 py-1.5 text-[11px] leading-snug text-chalk shadow-xl"
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

export function HelpHint({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip text={text} className={cn("align-middle", className)}>
      <Info className="h-3.5 w-3.5 cursor-help text-mist hover:text-chalk" />
    </Tooltip>
  );
}
