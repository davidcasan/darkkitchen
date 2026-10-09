import type { NextConfig } from "next";

// Endereços de onde a plataforma é acessada além do próprio servidor:
// - túnel provisório do Cloudflare (o endereço muda a cada vez, por isso o curinga);
// - o endereço definitivo, lido do APP_URL no .env.local (ex.: https://app.darkkitchen.art.br);
// - outros, separados por vírgula, em DOMINIOS_EXTRA (ex.: darkkitchen.art.br,www.darkkitchen.art.br).
function dominiosPermitidos() {
  const lista = ["*.trycloudflare.com"];
  try {
    if (process.env.APP_URL) lista.push(new URL(process.env.APP_URL).host);
  } catch {
    // APP_URL inválido: fica só o resto da lista.
  }
  for (const d of (process.env.DOMINIOS_EXTRA ?? "").split(",")) if (d.trim()) lista.push(d.trim());
  return [...new Set(lista)];
}

const DOMINIOS = dominiosPermitidos();

// cacheComponents fica desligado de propósito: todas as áreas logadas leem a
// sessão por cookie, e o modo dinâmico tradicional é mais simples de manter.
const nextConfig: NextConfig = {
  // Modo desenvolvimento: libera o JavaScript da página para quem acessa pelo túnel.
  // Sem isso, a tela abre mas nada responde a cliques.
  allowedDevOrigins: DOMINIOS,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
      // Formulários (login, pedidos) enviados a partir desses endereços (túnel, domínio próprio).
      allowedOrigins: DOMINIOS,
    },
  },
  // Não anuncia "X-Powered-By: Next.js" nas respostas.
  poweredByHeader: false,
};

export default nextConfig;
