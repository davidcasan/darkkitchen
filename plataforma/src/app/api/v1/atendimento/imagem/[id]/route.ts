import fs from "node:fs";
import { comUsuario } from "@/server/api";
import { ErroNegocio } from "@/server/db";
import { imagemDaMensagem } from "@/server/services/atendimento";

// Imagem anexada a uma mensagem do atendimento. Só o cliente da conversa e o admin.
// A imagem de uma mensagem nunca muda, então o navegador pode guardá-la.
export const GET = comUsuario<RouteContext<"/api/v1/atendimento/imagem/[id]">>(async (_req, usuario, ctx) => {
  const { id } = await ctx.params;
  const img = imagemDaMensagem(usuario, Number(id));
  if (!fs.existsSync(img.caminho)) throw new ErroNegocio("Imagem não encontrada.", 404);
  return new Response(new Uint8Array(fs.readFileSync(img.caminho)), {
    headers: {
      "Content-Type": img.mime,
      "Content-Length": String(img.tamanho),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(img.nome)}`,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
