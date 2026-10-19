"use client";

// O MC COB é só tema claro (uso de dia, em escritório). O hook continua existindo porque gráficos e o
// editor do fluxo perguntam o tema; a resposta agora é sempre "light". O botão de alternar saiu.
type Tema = "dark" | "light";

export function useTheme(): Tema {
  return "light";
}

export function ThemeToggle(_: { className?: string }) {
  return null;
}
