import { falha, ok, tratarErro } from "@/server/api";
import { maquinaAutorizada, receberDaMaquina } from "@/server/services/iaComp";

// Máquina operária devolve o resultado: PUT ?tipo=previa (opcional) e depois ?tipo=aep (conclui).
// O corpo é o próprio arquivo.
export async function PUT(req: Request, ctx: RouteContext<"/api/v1/ia-comp/[id]/resultado">) {
  try {
    if (!maquinaAutorizada(req)) return falha("Não autorizado.", 401);
    const tipo = new URL(req.url).searchParams.get("tipo");
    if (tipo !== "aep" && tipo !== "previa") return falha("Tipo inválido.");
    const { id } = await ctx.params;
    await receberDaMaquina(Number(id), tipo, req.body);
    return ok({ recebido: tipo });
  } catch (e) {
    return tratarErro(e);
  }
}
