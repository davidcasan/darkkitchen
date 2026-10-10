import { falha, ok, tratarErro } from "@/server/api";
import { maquinaAutorizada, proximoParaMaquina } from "@/server/services/iaComp";

// Máquina operária: pede o próximo trabalho (Authorization: Bearer IA_COMP_TOKEN_MAQUINA).
// 200 { id, codigo, kit } ou 204 quando a fila está vazia.
export function GET(req: Request) {
  try {
    if (!maquinaAutorizada(req)) return falha("Não autorizado.", 401);
    const job = proximoParaMaquina();
    if (!job) return new Response(null, { status: 204 });
    return ok({ ...job, kit: `/api/v1/ia-comp/${job.id}/arquivo/kit` });
  } catch (e) {
    return tratarErro(e);
  }
}
