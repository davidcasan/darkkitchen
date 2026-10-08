import fs from "node:fs";
import { Readable } from "node:stream";
import { comUsuario } from "@/server/api";
import { arquivoParaUsuario, caminhoAbsoluto } from "@/server/services/arquivos";

// Download com suporte a Range: o player de vídeo precisa disso para avançar e voltar.
// ?baixar=1 força o download em vez de abrir no navegador.
export const GET = comUsuario<RouteContext<"/api/v1/arquivos/[id]">>(async (req, usuario, ctx) => {
  const { id } = await ctx.params;
  const a = arquivoParaUsuario(Number(id), usuario);
  const caminho = caminhoAbsoluto(a);
  if (!fs.existsSync(caminho)) return new Response("Arquivo não encontrado.", { status: 404 });

  const tamanho = fs.statSync(caminho).size;
  const baixar = new URL(req.url).searchParams.has("baixar");
  // SVG pode conter script: nunca exibe inline, sempre baixa.
  const inline = !baixar && a.mime !== "image/svg+xml";
  const headers: Record<string, string> = {
    "Content-Type": a.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
  };

  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let inicio = range[1] ? Number(range[1]) : tamanho - Number(range[2]);
    let fim = range[1] && range[2] ? Number(range[2]) : tamanho - 1;
    inicio = Math.max(0, inicio);
    fim = Math.min(fim, tamanho - 1);
    if (inicio > fim) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${tamanho}` } });
    const corpo = Readable.toWeb(fs.createReadStream(caminho, { start: inicio, end: fim })) as ReadableStream;
    return new Response(corpo, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${inicio}-${fim}/${tamanho}`, "Content-Length": String(fim - inicio + 1) },
    });
  }

  const corpo = Readable.toWeb(fs.createReadStream(caminho)) as ReadableStream;
  return new Response(corpo, { headers: { ...headers, "Content-Length": String(tamanho) } });
});
