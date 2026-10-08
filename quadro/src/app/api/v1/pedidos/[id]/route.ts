import { comUsuario, ok } from "@/server/api";
import { pedidoParaUsuario } from "@/server/services/pedidos";

export const GET = comUsuario<RouteContext<"/api/v1/pedidos/[id]">>(async (_req, usuario, ctx) => {
  const { id } = await ctx.params;
  return ok(pedidoParaUsuario(Number(id), usuario));
});
