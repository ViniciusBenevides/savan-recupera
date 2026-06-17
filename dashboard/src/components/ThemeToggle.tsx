"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tema = "dark" | "light";

function temaAtual(): Tema {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

/** Hook reativo: devolve o tema atual e reage a mudanças na classe do <html>. */
export function useTheme(): Tema {
  const [tema, setTema] = useState<Tema>("dark");
  useEffect(() => {
    setTema(temaAtual());
    const obs = new MutationObserver(() => setTema(temaAtual()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return tema;
}

export function ThemeToggle({ className }: { className?: string }) {
  const [tema, setTema] = useState<Tema>("dark");
  useEffect(() => setTema(temaAtual()), []);

  function alternar() {
    const prox: Tema = tema === "dark" ? "light" : "dark";
    const root = document.documentElement;
    if (prox === "light") root.classList.add("light");
    else root.classList.remove("light");
    try { localStorage.setItem("theme", prox); } catch { /* */ }
    setTema(prox);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      title={tema === "dark" ? "Mudar para modo claro" : "Mudar para modo escuro"}
      aria-label="Alternar tema"
      className={cn(
        "relative grid h-9 w-9 place-items-center rounded-xl border border-line text-mist transition-colors hover:bg-ink-800 hover:text-chalk",
        className,
      )}
    >
      {tema === "dark"
        ? <Sun className="h-[18px] w-[18px]" />
        : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}
