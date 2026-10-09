"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarVersaoAction } from "@/app/actions/equipe";
import { enviarArquivo, formatarTamanho } from "./upload";

/** Designer envia o vídeo da versão (e arquivos de entrega, como outros formatos ou o .aep). */
export function EnviarVersao({ pedidoId, numero }: { pedidoId: number; numero: number }) {
  const router = useRouter();
  const [video, setVideo] = useState<File | null>(null);
  const [extras, setExtras] = useState<File[]>([]);
  const [nota, setNota] = useState("");
  const [etapa, setEtapa] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!video) return setErro("Escolha o vídeo da versão.");
    setErro(null);
    try {
      setEtapa("Enviando vídeo...");
      const principal = await enviarArquivo(video, "versao");
      const ids: number[] = [];
      for (const [i, f] of extras.entries()) {
        setEtapa(`Enviando arquivos de entrega (${i + 1}/${extras.length})...`);
        ids.push((await enviarArquivo(f, "entrega")).id);
      }
      setEtapa("Registrando versão...");
      const r = await enviarVersaoAction(pedidoId, principal.id, ids, nota);
      if (r?.erro) throw new Error(r.erro);
      router.push(`/equipe/pedidos/${pedidoId}?ok=versao_enviada`);
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha no envio.");
    } finally {
      setEtapa(null);
    }
  }

  return (
    <form onSubmit={enviar}>
      <div className="field">
        <span className="label">Vídeo da versão {numero}</span>
        <label className="drop">
          <span className="ic" aria-hidden="true">
            ▶
          </span>
          <span>
            <b>{video ? video.name : "Escolher vídeo"}</b>
            <br />
            <span className="opt">{video ? formatarTamanho(video.size) : "MP4 (H.264) para tocar no navegador do cliente"}</span>
          </span>
          <input type="file" accept="video/*" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <div className="field">
        <span className="label">
          Arquivos de entrega <span className="opt">(opcional)</span>
        </span>
        <label className="drop">
          <span className="ic" aria-hidden="true">
            ↑
          </span>
          <span>
            <b>{extras.length ? `${extras.length} arquivo(s)` : "Outros formatos, .aep, legendas"}</b>
            <br />
            <span className="opt">{extras.map((f) => f.name).join(", ") || "Liberados ao cliente junto com a versão"}</span>
          </span>
          <input type="file" multiple onChange={(e) => setExtras(Array.from(e.target.files ?? []))} />
        </label>
      </div>
      <div className="field">
        <label className="label" htmlFor="nota-versao">
          Nota para o diretor de arte <span className="opt">(opcional)</span>
        </label>
        <textarea id="nota-versao" className="txt" value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={etapa !== null}>
        {etapa ?? "Enviar para controle de qualidade"}
      </button>
      {erro && (
        <p className="alerta alerta-erro" style={{ marginTop: 12 }}>
          {erro}
        </p>
      )}
    </form>
  );
}
