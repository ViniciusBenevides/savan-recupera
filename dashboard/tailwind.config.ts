import type { Config } from "tailwindcss";

// Cores baseadas em CSS variables (canais RGB) → trocam entre tema escuro e claro.
// Suporta utilitários de opacidade (ex.: bg-emerald/15) via <alpha-value>.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: v("--c-bg"),
          900: v("--c-900"),
          850: v("--c-surface"),
          800: v("--c-800"),
          700: v("--c-700"),
          600: v("--c-600"),
          500: v("--c-500"),
        },
        line: v("--c-line"),
        mist: v("--c-mist"),
        chalk: v("--c-chalk"),
        emerald: { DEFAULT: v("--c-emerald"), soft: v("--c-emerald-soft"), deep: v("--c-emerald-deep") },
        violet: { DEFAULT: v("--c-violet"), deep: v("--c-violet-deep") },
        amber: { DEFAULT: v("--c-amber") },
        rose: { DEFAULT: v("--c-rose") },
        blue: { DEFAULT: v("--c-blue") },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseglow: { "0%,100%": { opacity: "0.5" }, "50%": { opacity: "1" } },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both",
        pulseglow: "pulseglow 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
