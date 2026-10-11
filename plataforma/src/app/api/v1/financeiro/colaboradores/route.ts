import { falha } from "@/server/api";
import { usuarioDaRequisicao } from "@/server/auth";
import { csvDoMes, mesAtual, mesValido } from "@/server/services/colaboradores";

// Planilha do mês (horas previstas e valores por colaborador e pedido), para o contador. Só o admin.
export async function GET(req: Request) {
  const u = usuarioDaRequisicao(req);
  if (!u || u.papel !== "admin") return falha("Não autorizado.", 404);
  const mes = mesValido(new URL(req.url).searchParams.get("mes")) ?? mesAtual();
  return new Response(csvDoMes(mes), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="colaboradores-${mes}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
