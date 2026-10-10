import fs from "node:fs";
import { falha } from "@/server/api";
import { usuarioDaRequisicao } from "@/server/auth";
import { ehEquipe } from "@/domain/pedido";
import { servirArquivo } from "@/server/servirArquivo";
import { arquivoDoJob, maquinaAutorizada } from "@/server/services/iaComp";
import { um } from "@/server/db";

// Arquivos da IA Comp (kit.zip, comp.aep, previa.png): só a equipe, ou a máquina operária (kit).
const TIPOS = { kit: ["application/zip", "zip"], aep: ["application/octet-stream", "aep"], previa: ["image/png", "png"] } as const;

export async function GET(req: Request, ctx: RouteContext<"/api/v1/ia-comp/[id]/arquivo/[tipo]">) {
  const { id, tipo } = await ctx.params;
  if (!(tipo in TIPOS)) return falha("Tipo inválido.", 404);
  const t = tipo as keyof typeof TIPOS;
  const u = usuarioDaRequisicao(req);
  const permitido = (u && ehEquipe(u.papel)) || (t === "kit" && maquinaAutorizada(req));
  if (!permitido) return falha("Arquivo não encontrado.", 404);
  const job = um<{ id: number; codigo: string }>(
    "SELECT j.id, p.codigo FROM ia_comp_jobs j JOIN pedidos p ON p.id = j.pedido_id WHERE j.id = ?",
    Number(id),
  );
  if (!job) return falha("Arquivo não encontrado.", 404);
  const caminho = arquivoDoJob(job.id, t);
  if (!fs.existsSync(caminho)) return falha("Arquivo ainda não gerado.", 404);
  const stat = fs.statSync(caminho);
  return servirArquivo(req, caminho, {
    mime: TIPOS[t][0],
    nome: `${job.codigo}-ia-comp.${TIPOS[t][1]}`,
    inline: t === "previa",
    etag: `"iacomp-${job.id}-${t}-${stat.mtimeMs}"`,
    cache: "private, no-cache",
  });
}
