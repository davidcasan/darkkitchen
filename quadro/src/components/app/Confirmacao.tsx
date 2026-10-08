"use client";

import { useEffect } from "react";

/** Mostra a confirmação da última ação e tira o "?ok=" do endereço, para não reaparecer ao recarregar. */
export function Confirmacao({ texto }: { texto: string | null }) {
  useEffect(() => {
    if (!texto) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("ok");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [texto]);

  if (!texto) return null;
  return (
    <p className="alerta alerta-ok" role="status" style={{ marginBottom: 16 }}>
      {texto}
    </p>
  );
}
