import type { Metadata, Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import "./globals.css";
import "./ui.css";

const display = Sora({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const body = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Dark Kitchen Studio · Motion graphics direto da cozinha",
    template: "%s · Dark Kitchen Studio",
  },
  // O site já é escuro: pede à extensão Dark Reader para não reescurecer as cores.
  other: { "darkreader-lock": "true" },
  description:
    "Estúdio de motion graphics sem salão: você faz o pedido, a cozinha produz e a peça chega pronta. Vídeos, posts animados e vinhetas por créditos.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0d0d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`} data-scroll-behavior="smooth">
      <body>
        {children}
      </body>
    </html>
  );
}
