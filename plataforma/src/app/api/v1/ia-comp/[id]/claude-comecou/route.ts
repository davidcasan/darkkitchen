import { falha, ok, tratarErro } from "@/server/api";
import { claudeComecou, maquinaAutorizada } from "@/server/services/iaComp";

// O Claude avisa que começou a criar o pedido da fila (aparece como "Claude criando").
export async function POST(req: Request, ctx: RouteContext<"/api/v1/ia-comp/[id]/claude-comecou">) {
  try {
    if (!maquinaAutorizada(req)) return falha("Não autorizado.", 401);
    const { id } = await ctx.params;
    claudeComecou(Number(id));
    return ok({ registrado: true });
  } catch (e) {
    return tratarErro(e);
  }
}
