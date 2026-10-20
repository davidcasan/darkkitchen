import { comUsuario, falha, ok } from "@/server/api";
import { type Categoria, type Envio, envioDeFile, salvarArquivo } from "@/server/services/arquivos";

// Upload, de dois jeitos (devolve o id, que depois é citado no briefing ou na versão):
// - corpo = o próprio arquivo, com ?categoria=&nome= (e &marca= para logo/manual): gravado
//   em fluxo, sem passar pela memória; é o que o navegador usa (vídeos grandes, sem limite);
// - multipart/form-data com os campos "arquivo", "categoria" e "marca" (compatibilidade).
export const POST = comUsuario(async (req, usuario) => {
  let envio: Envio;
  let categoria: unknown;
  let marca: number | null;
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const arquivo = form?.get("arquivo");
    if (!(arquivo instanceof File)) return falha("Nenhum arquivo enviado.");
    envio = envioDeFile(arquivo);
    categoria = form?.get("categoria");
    marca = Number(form?.get("marca")) || null;
  } else {
    const q = new URL(req.url).searchParams;
    envio = { nome: q.get("nome") ?? "arquivo", mime: req.headers.get("content-type") ?? "", corpo: req.body };
    categoria = q.get("categoria");
    marca = Number(q.get("marca")) || null;
  }
  if (typeof categoria !== "string") return falha("Informe a categoria do arquivo.");
  const a = await salvarArquivo(usuario, envio, categoria as Categoria, null, marca);
  return ok({ id: a.id, nome: a.nome, tamanho: a.tamanho, mime: a.mime }, 201);
});
