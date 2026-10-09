"use client";

import { useState } from "react";
import styles from "./CobrancaPix.module.css";

/** Campo com o texto (ex.: Pix copia e cola) e botão para copiar. */
export function CopiarTexto({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className={styles.copiar}>
      <input className="txt" value={texto} readOnly aria-label="Código Pix copia e cola" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn btn-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(texto);
          } catch {
            // Sem acesso à área de transferência (ex.: página sem HTTPS): o campo fica selecionado para copiar à mão.
          }
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        }}
      >
        {copiado ? "Copiado!" : rotulo}
      </button>
    </div>
  );
}
