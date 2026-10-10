import { comUsuario } from "@/server/api";
import { servirArquivo } from "@/server/servirArquivo";
import { arquivoParaUsuario, caminhoAbsoluto } from "@/server/services/arquivos";

// Download com suporte a Range: o player de vídeo precisa disso para avançar e voltar.
// ?baixar=1 força o download em vez de abrir no navegador.
export const GET = comUsuario<RouteContext<"/api/v1/arquivos/[id]">>(async (req, usuario, ctx) => {
  const { id } = await ctx.params;
  const a = arquivoParaUsuario(Number(id), usuario);
  const baixar = new URL(req.url).searchParams.has("baixar");
  return servirArquivo(req, caminhoAbsoluto(a), {
    mime: a.mime,
    nome: a.nome,
    // SVG pode conter script: nunca exibe inline, sempre baixa.
    inline: !baixar && a.mime !== "image/svg+xml",
    // O nome em disco é único (UUID) e nunca muda: serve de identidade do conteúdo.
    etag: `"${a.caminho.replace(/[^a-zA-Z0-9-]/g, "")}"`,
    // "no-cache" faz o navegador sempre confirmar com o servidor antes de reusar a cópia,
    // então o mesmo endereço nunca mostra um arquivo antigo.
    cache: "private, no-cache",
  });
});
