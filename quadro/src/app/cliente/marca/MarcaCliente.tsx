"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarArquivo } from "@/components/app/upload";

export function EnviarArquivoMarca({ categoria }: { categoria: "logo" | "manual" }) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ enviando: boolean; erro?: string }>({ enviando: false });
  return (
    <>
      <label className="drop">
        <span className="ic" aria-hidden="true">
          ↑
        </span>
        <span>
          <b>{estado.enviando ? "Enviando..." : categoria === "logo" ? "Enviar logo" : "Enviar arquivos"}</b>
          <br />
          <span className="opt">{categoria === "logo" ? "SVG, AI, PDF ou PNG em alta resolução" : "PDF do manual, arquivos de fonte"}</span>
        </span>
        <input
          type="file"
          multiple
          disabled={estado.enviando}
          accept={categoria === "logo" ? ".svg,.ai,.png,.pdf,.eps" : undefined}
          onChange={async (e) => {
            const lista = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (!lista.length) return;
            setEstado({ enviando: true });
            try {
              for (const f of lista) await enviarArquivo(f, categoria);
              setEstado({ enviando: false });
              router.refresh();
            } catch (err) {
              setEstado({ enviando: false, erro: err instanceof Error ? err.message : "Falha no envio." });
            }
          }}
        />
      </label>
      {estado.erro && (
        <p className="alerta alerta-erro" style={{ marginTop: 8 }}>
          {estado.erro}
        </p>
      )}
    </>
  );
}

export function CoresMarca({ iniciais }: { iniciais: string[] }) {
  const [cores, setCores] = useState(iniciais);
  return (
    <div className="field">
      <span className="label">Cores da marca</span>
      <div className="row">
        {cores.map((c, i) => (
          <label key={i} className="chip" style={{ paddingLeft: 6 }}>
            <input
              type="color"
              name="cor"
              value={c}
              aria-label={`Cor ${i + 1}`}
              style={{ width: 30, height: 30, border: 0, padding: 0, background: "none" }}
              onChange={(e) => setCores(cores.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <span className="tnum">{c.toUpperCase()}</span>
            {cores.length > 1 && (
              <button
                type="button"
                className="link"
                aria-label={`Remover cor ${i + 1}`}
                onClick={() => setCores(cores.filter((_, j) => j !== i))}
              >
                ×
              </button>
            )}
          </label>
        ))}
        {cores.length < 5 && (
          <button type="button" className="btn btn-sm" onClick={() => setCores([...cores, "#191C2E"])}>
            + Cor
          </button>
        )}
      </div>
    </div>
  );
}
