import { servirArquivo } from "@/server/servirArquivo";
import { midiaPublica } from "@/server/services/perfis";

// Foto ou vídeo de um perfil do Quem somos (público, com Range para o player).
// O nome é único e nunca muda de conteúdo: o navegador pode guardar por um ano.
export async function GET(req: Request, ctx: RouteContext<"/api/v1/perfis/midia/[nome]">) {
  const { nome } = await ctx.params;
  const m = midiaPublica(nome);
  if (!m) return new Response("Arquivo não encontrado.", { status: 404 });
  return servirArquivo(req, m.caminho, {
    mime: m.mime,
    nome,
    inline: true,
    etag: `"${nome.replace(/[^a-zA-Z0-9-]/g, "")}"`,
    cache: "public, max-age=31536000, immutable",
  });
}
