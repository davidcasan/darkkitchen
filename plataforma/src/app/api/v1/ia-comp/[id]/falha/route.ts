import { falha, ok, tratarErro } from "@/server/api";
import { falhaDaMaquina, maquinaAutorizada } from "@/server/services/iaComp";

// Máquina operária avisa que não conseguiu montar a composição.
export async function POST(req: Request, ctx: RouteContext<"/api/v1/ia-comp/[id]/falha">) {
  try {
    if (!maquinaAutorizada(req)) return falha("Não autorizado.", 401);
    const corpo = (await req.json().catch(() => ({}))) as { erro?: string };
    const { id } = await ctx.params;
    falhaDaMaquina(Number(id), String(corpo.erro ?? "erro desconhecido"));
    return ok({ registrado: true });
  } catch (e) {
    return tratarErro(e);
  }
}
