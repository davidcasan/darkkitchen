// Envio de arquivo pela API (usado pelo navegador; o app mobile usará a mesma rota).

export interface ArquivoEnviado {
  id: number;
  nome: string;
  tamanho: number;
  mime: string;
}

export async function enviarArquivo(arquivo: File, categoria: string): Promise<ArquivoEnviado> {
  const fd = new FormData();
  fd.append("arquivo", arquivo);
  fd.append("categoria", categoria);
  const r = await fetch("/api/v1/arquivos", { method: "POST", body: fd });
  const json = (await r.json().catch(() => ({}))) as { dados?: ArquivoEnviado; erro?: string };
  if (!r.ok || !json.dados) throw new Error(json.erro ?? "Não foi possível enviar o arquivo.");
  return json.dados;
}

export const urlArquivo = (id: number, baixar = false) => `/api/v1/arquivos/${id}${baixar ? "?baixar=1" : ""}`;

export const formatarTamanho = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
