import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Atkinson_Hyperlegible_Mono, Fraunces } from "next/font/google";
import "./globals.css";

// Uma família só: a Atkinson Hyperlegible foi desenhada para ser lida sem esforço, que é o que
// importa para quem passa o dia lendo nome, CPF e valor. A versão Mono fica para dinheiro e datas.
const sans = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Atkinson_Hyperlegible_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
// Títulos com serifa, como no MC COB (Georgia) e no site da MC CRED (Fraunces).
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap" });

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "MC COB";
const DESCRICAO = "Cobrança das carteiras da MC CRED: fila do dia, conversas de WhatsApp, acordos e recebimentos.";
// Endereço público, para a imagem do link sair com URL completa. Na Vercel o Next descobre sozinho.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export const metadata: Metadata = {
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL) } : {}),
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: DESCRICAO,
  // Sistema com login: ninguém precisa achá-lo no Google. O link mandado no WhatsApp continua
  // mostrando nome, frase e a imagem de app/opengraph-image.png.
  robots: { index: false, follow: false },
  openGraph: { type: "website", locale: "pt_BR", siteName: APP_NAME, title: APP_NAME, description: DESCRICAO },
};

export const viewport: Viewport = {
  themeColor: "#07090B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
