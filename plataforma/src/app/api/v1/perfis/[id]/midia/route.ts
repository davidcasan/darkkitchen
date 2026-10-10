import { revalidatePath } from "next/cache";
import { comUsuario, falha, ok } from "@/server/api";
import { TIPOS_MIDIA, type TipoMidia, removerMidia, salvarMidia, urlMidia } from "@/server/services/perfis";

// Mídias de um perfil do Quem somos (só admin). ?tipo=foto | video_16x9 | video_9x16.
// PUT: o corpo da requisição é o próprio arquivo (sem multipart), gravado em fluxo,
// para vídeos grandes não passarem pela memória.
const tipoDe = (req: Request) => {
  const t = new URL(req.url).searchParams.get("tipo") as TipoMidia | null;
  return t && TIPOS_MIDIA.includes(t) ? t : null;
};

export const PUT = comUsuario<RouteContext<"/api/v1/perfis/[id]/midia">>(async (req, usuario, ctx) => {
  const tipo = tipoDe(req);
  if (!tipo) return falha("Tipo de mídia inválido.");
  const { id } = await ctx.params;
  const nome = await salvarMidia(usuario, Number(id), tipo, req.body);
  revalidatePath("/quem-somos");
  return ok({ url: urlMidia(nome) }, 201);
});

export const DELETE = comUsuario<RouteContext<"/api/v1/perfis/[id]/midia">>(async (req, usuario, ctx) => {
  const tipo = tipoDe(req);
  if (!tipo) return falha("Tipo de mídia inválido.");
  const { id } = await ctx.params;
  removerMidia(usuario, Number(id), tipo);
  revalidatePath("/quem-somos");
  return ok({ removido: true });
});
