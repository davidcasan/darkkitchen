// IP de quem fez a requisição. Atrás do Cloudflare (túnel), o IP real vem em
// cf-connecting-ip; em outros proxies, em x-forwarded-for.
export function ipDe(cabecalhos: { get(nome: string): string | null }) {
  return (
    cabecalhos.get("cf-connecting-ip") ??
    cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    cabecalhos.get("x-real-ip") ??
    "local"
  );
}
