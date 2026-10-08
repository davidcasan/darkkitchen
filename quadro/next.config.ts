import type { NextConfig } from "next";

// cacheComponents fica desligado de propósito: todas as áreas logadas leem a
// sessão por cookie, e o modo dinâmico tradicional é mais simples de manter.
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
