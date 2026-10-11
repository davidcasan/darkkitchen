import { falha, ok, tratarErro } from "@/server/api";
import { maquinaAutorizada, novaVersaoManual } from "@/server/services/iaComp";

// Começa uma versão feita fora do site (pelo Claude no chat): guarda a atual e espera a
// composição e a prévia pela rota /resultado. Usado por scripts/ia-comp-enviar.mjs.
export async function POST(req: Request, ctx: RouteContext<"/api/v1/ia-comp/[id]/nova-versao">) {
  try {
    if (!maquinaAutorizada(req)) return falha("Não autorizado.", 401);
    const corpo = (await req.json().catch(() => ({}))) as { nota?: string; especificacao?: string };
    const { id } = await ctx.params;
    novaVersaoManual(Number(id), String(corpo.nota ?? ""), String(corpo.especificacao ?? ""));
    return ok({ iniciada: true });
  } catch (e) {
    return tratarErro(e);
  }
}
