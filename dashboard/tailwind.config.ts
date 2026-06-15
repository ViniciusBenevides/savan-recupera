import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#08090C",
          900: "#0B0D12",
          850: "#0F1117",
          800: "#13151D",
          700: "#1B1E28",
          600: "#262A36",
          500: "#3A3F4F",
        },
        line: "#1F2330",
        mist: "#8A91A6",
        chalk: "#E7EAF2",
        emerald: {
          DEFAULT: "#2BD98C",
          soft: "#34D399",
          deep: "#0E5C3D",
        },
        violet: { DEFAULT: "#8B7CF6", deep: "#3B2E73" },
        amber: { DEFAULT: "#F5B544" },
        rose: { DEFAULT: "#F4607A" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(43,217,140,0.18), 0 18px 60px -20px rgba(43,217,140,0.35)",
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 24px 50px -28px rgba(0,0,0,0.8)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseglow: {
          "0%,100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
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
