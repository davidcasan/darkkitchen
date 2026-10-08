import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";
import "./ui.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const body = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Quadro · Motion graphics sob demanda",
    template: "%s · Quadro",
  },
  description:
    "Peças de motion graphics feitas por designers, pedidas por um briefing guiado e pagas com créditos.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f8" },
    { media: "(prefers-color-scheme: dark)", color: "#12142a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
