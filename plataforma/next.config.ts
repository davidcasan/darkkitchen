import type { NextConfig } from "next";

// Túneis usados para abrir o servidor local pela internet (ex.: Cloudflare Tunnel).
// O endereço do túnel rápido muda a cada vez que ele é iniciado, por isso o curinga.
const TUNEIS = ["*.trycloudflare.com"];

// cacheComponents fica desligado de propósito: todas as áreas logadas leem a
// sessão por cookie, e o modo dinâmico tradicional é mais simples de manter.
const nextConfig: NextConfig = {
  // Modo desenvolvimento: libera o JavaScript da página para quem acessa pelo túnel.
  // Sem isso, a tela abre mas nada responde a cliques.
  allowedDevOrigins: TUNEIS,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
      // Formulários (login, pedidos) enviados a partir do endereço do túnel.
      allowedOrigins: TUNEIS,
    },
  },
};

export default nextConfig;
