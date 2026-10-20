// Envio de arquivo pela API (usado pelo navegador; o app mobile usará a mesma rota).

export interface ArquivoEnviado {
  id: number;
  nome: string;
  tamanho: number;
  mime: string;
}

// O arquivo vai direto no corpo (sem multipart): o servidor grava em fluxo, então não há
// limite de tamanho para o cliente. onProgresso recebe de 0 a 100 (vídeos grandes demoram).
export function enviarArquivo(
  arquivo: File,
  categoria: string,
  marcaId?: number | null,
  onProgresso?: (pct: number) => void,
): Promise<ArquivoEnviado> {
  const q = new URLSearchParams({ categoria, nome: arquivo.name });
  if (marcaId) q.set("marca", String(marcaId));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/v1/arquivos?${q}`);
    xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
    if (onProgresso) xhr.upload.onprogress = (e) => e.lengthComputable && onProgresso(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let json: { dados?: ArquivoEnviado; erro?: string } = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && json.dados) resolve(json.dados);
      else reject(new Error(json.erro ?? "Não foi possível enviar o arquivo."));
    };
    xhr.onerror = () => reject(new Error("A conexão caiu durante o envio. Tente de novo."));
    xhr.send(arquivo);
  });
}

/** Endereço do arquivo. "token" (identidade do conteúdo) garante que o navegador nunca mostre uma cópia antiga. */
export function urlArquivo(id: number, baixar = false, token?: string) {
  const q = new URLSearchParams();
  if (baixar) q.set("baixar", "1");
  if (token) q.set("v", token);
  const s = q.toString();
  return `/api/v1/arquivos/${id}${s ? `?${s}` : ""}`;
}

export const formatarTamanho = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
