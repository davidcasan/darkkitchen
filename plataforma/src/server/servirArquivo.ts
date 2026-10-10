import "server-only";
import fs from "node:fs";

// Entrega de arquivo do disco com suporte a Range (o player de vídeo precisa disso
// para avançar e voltar). Usado pelos downloads de pedidos e pelas mídias do Quem somos.

/**
 * Lê o arquivo em pedaços sob demanda (respeita o ritmo do navegador) e para de ler
 * assim que o download é cancelado, por exemplo quando o player pula para outro trecho.
 * Sem isso, a leitura continuava escrevendo numa conexão já fechada e gerava uma
 * exceção não tratada, que em produção pode derrubar o servidor.
 */
function fluxoDoArquivo(caminho: string, sinal: AbortSignal, faixa?: { start: number; end: number }): ReadableStream<Uint8Array> {
  const leitura = fs.createReadStream(caminho, faixa);
  const pedacos = leitura[Symbol.asyncIterator]();
  const encerrar = () => leitura.destroy();
  sinal.addEventListener("abort", encerrar, { once: true });
  return new ReadableStream<Uint8Array>({
    async pull(controle) {
      try {
        const { value, done } = await pedacos.next();
        if (done) {
          sinal.removeEventListener("abort", encerrar);
          controle.close();
        } else controle.enqueue(new Uint8Array(value as Buffer));
      } catch (e) {
        encerrar();
        if (!sinal.aborted) controle.error(e);
      }
    },
    cancel() {
      encerrar();
    },
  });
}

export interface OpcoesServir {
  mime: string;
  nome: string; // nome sugerido ao baixar
  inline: boolean;
  etag: string;
  cache: string; // Cache-Control
}

export function servirArquivo(req: Request, caminho: string, o: OpcoesServir): Response {
  if (!fs.existsSync(caminho)) return new Response("Arquivo não encontrado.", { status: 404 });
  const tamanho = fs.statSync(caminho).size;
  const headers: Record<string, string> = {
    "Content-Type": o.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": o.cache,
    ETag: o.etag,
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${o.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(o.nome)}`,
  };
  if (req.headers.get("if-none-match") === o.etag) return new Response(null, { status: 304, headers });

  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let inicio = range[1] ? Number(range[1]) : tamanho - Number(range[2]);
    let fim = range[1] && range[2] ? Number(range[2]) : tamanho - 1;
    inicio = Math.max(0, inicio);
    fim = Math.min(fim, tamanho - 1);
    if (inicio > fim) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${tamanho}` } });
    const corpo = fluxoDoArquivo(caminho, req.signal, { start: inicio, end: fim });
    return new Response(corpo, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${inicio}-${fim}/${tamanho}`, "Content-Length": String(fim - inicio + 1) },
    });
  }

  const corpo = fluxoDoArquivo(caminho, req.signal);
  return new Response(corpo, { headers: { ...headers, "Content-Length": String(tamanho) } });
}
