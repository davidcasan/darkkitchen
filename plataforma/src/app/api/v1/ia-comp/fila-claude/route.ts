import { falha, ok, tratarErro } from "@/server/api";
import { filaDoClaude, maquinaAutorizada } from "@/server/services/iaComp";

// Fila de criações pedidas ao Claude no chat (token da máquina). Usado por scripts/ia-comp-claude.mjs.
export async function GET(req: Request) {
  try {
    if (!maquinaAutorizada(req)) return falha("Não autorizado.", 401);
    return ok(filaDoClaude());
  } catch (e) {
    return tratarErro(e);
  }
}
