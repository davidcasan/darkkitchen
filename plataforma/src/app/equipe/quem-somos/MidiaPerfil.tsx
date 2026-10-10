"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import styles from "./quem-somos.module.css";

type Tipo = "foto" | "video_16x9" | "video_9x16";

// Envio de foto ou vídeo de um perfil. O arquivo vai direto no corpo da requisição
// (sem multipart) e com barra de progresso, porque os vídeos podem ter centenas de MB.
export function MidiaPerfil({ perfilId, tipo, url, rotulo }: { perfilId: number; tipo: Tipo; url: string | null; rotulo: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ehFoto = tipo === "foto";
  const endereco = `/api/v1/perfis/${perfilId}/midia?tipo=${tipo}`;

  function enviar(arquivo: File) {
    setErro(null);
    setProgresso(0);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", endereco);
    xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgresso(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgresso(null);
      if (xhr.status >= 200 && xhr.status < 300) return router.refresh();
      try {
        setErro((JSON.parse(xhr.responseText) as { erro?: string }).erro ?? "Não foi possível enviar.");
      } catch {
        setErro("Não foi possível enviar.");
      }
    };
    xhr.onerror = () => {
      setProgresso(null);
      setErro("A conexão caiu durante o envio. Tente de novo.");
    };
    xhr.send(arquivo);
  }

  async function remover() {
    if (!window.confirm(`Remover ${rotulo.toLowerCase()}?`)) return;
    setErro(null);
    const r = await fetch(endereco, { method: "DELETE" });
    if (!r.ok) setErro(((await r.json().catch(() => ({}))) as { erro?: string }).erro ?? "Não foi possível remover.");
    else router.refresh();
  }

  return (
    <div className={styles.midia} data-tipo={tipo}>
      <span className="label">{rotulo}</span>
      <div className={styles.previa}>
        {url ? (
          ehFoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" />
          ) : (
            <video src={url} controls preload="metadata" playsInline />
          )
        ) : (
          <span className="muted small">{ehFoto ? "Sem foto" : "Sem vídeo"}</span>
        )}
      </div>
      {progresso !== null ? (
        <div className={styles.progresso} role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progresso}%` }} />
          <small>Enviando... {progresso}%</small>
        </div>
      ) : (
        <div className="row small">
          <button type="button" className="btn btn-sm" onClick={() => entrada.current?.click()}>
            {url ? "Trocar" : "Enviar"}
          </button>
          {url && (
            <button type="button" className="link small" style={{ color: "var(--danger)" }} onClick={remover}>
              Remover
            </button>
          )}
        </div>
      )}
      <input
        ref={entrada}
        type="file"
        hidden
        accept={ehFoto ? "image/jpeg,image/png,image/webp" : "video/mp4,video/quicktime,video/webm"}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) enviar(f);
        }}
      />
      {erro && <p className="alerta alerta-erro small">{erro}</p>}
    </div>
  );
}
