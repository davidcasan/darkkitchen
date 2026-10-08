import { comUsuario, falha, ok } from "@/server/api";
import { type Categoria, salvarArquivo } from "@/server/services/arquivos";

// Upload: multipart/form-data com os campos "arquivo" e "categoria".
// Devolve o id, que depois é citado no briefing ou na versão.
export const POST = comUsuario(async (req, usuario) => {
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  const categoria = form?.get("categoria");
  if (!(arquivo instanceof File)) return falha("Nenhum arquivo enviado.");
  if (typeof categoria !== "string") return falha("Informe a categoria do arquivo.");
  const a = await salvarArquivo(usuario, arquivo, categoria as Categoria);
  return ok({ id: a.id, nome: a.nome, tamanho: a.tamanho, mime: a.mime }, 201);
});
