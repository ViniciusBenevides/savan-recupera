import type { Config } from "tailwindcss";

// Identidade MC COB / MC CRED: escuro, bronze e ouro (ver .impeccable/surfaces e DESIGN.md).
// Cores em CSS variables (canais RGB) para aceitar opacidade: bg-tinta/10, border-margem/40…
// Os nomes antigos (ink, line, mist, chalk, emerald…) continuam valendo e apontam para a paleta nova,
// para as telas que ainda não foram reescritas entrarem no mesmo mundo.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ---- vocabulário da caderneta ----
        capa: { DEFAULT: v("--c-capa"), escura: v("--c-capa-escura"), texto: v("--c-capa-texto"), apagado: v("--c-capa-apagado") },
        papel: v("--c-bg"),
        folha: v("--c-surface"),
        pauta: { DEFAULT: v("--c-line"), forte: v("--c-pauta-forte") },
        margem: { DEFAULT: v("--c-margem"), fundo: v("--c-margem-fundo") },
        tinta: { DEFAULT: v("--c-tinta"), media: v("--c-tinta-media"), clara: v("--c-tinta-clara") },
        ouro: v("--c-ouro"),
        "sobre-tinta": v("--c-sobre-tinta"),
        texto: v("--c-chalk"),
        lapis: v("--c-mist"),
        pago: { DEFAULT: v("--c-pago"), fundo: v("--c-pago-fundo") },
        atencao: { DEFAULT: v("--c-amber"), fundo: v("--c-atencao-fundo") },
        // ---- nomes antigos (compatibilidade) ----
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
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      // As telas antigas usam font-600/700/800, que o Tailwind não tinha: viravam peso normal.
      fontWeight: { "500": "500", "600": "600", "700": "700", "800": "800" },
      // …e bg-x/8, bg-x/12, que também não geravam CSS.
      opacity: { "8": "0.08", "12": "0.12", "15": "0.15" },
      fontSize: {
        meta: ["0.8125rem", { lineHeight: "1.125rem" }],
        sm2: ["0.875rem", { lineHeight: "1.25rem" }],
        corpo: ["1rem", { lineHeight: "1.5rem" }],
        titulo: ["1.375rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em" }],
        pagina: ["1.875rem", { lineHeight: "2.125rem", letterSpacing: "-0.02em" }],
      },
      borderRadius: { controle: "8px", botao: "10px", painel: "12px" },
      boxShadow: {
        flutua: "0 16px 40px -16px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(232, 161, 90, 0.10)",
        sobe: "0 1px 2px rgba(0, 0, 0, 0.5)",
      },
      transitionTimingFunction: {
        saida: "cubic-bezier(0.23, 1, 0.32, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        surgir: { "0%": { opacity: "0", transform: "scale(0.97)" }, "100%": { opacity: "1", transform: "scale(1)" } },
      },
      animation: {
        "fade-up": "fade-up 0.22s cubic-bezier(0.23,1,0.32,1) both",
        surgir: "surgir 0.18s cubic-bezier(0.23,1,0.32,1) both",
      },
    },
  },
  plugins: [],
};
export default config;
