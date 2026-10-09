"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Avisa o servidor de cada página vista (contador de acessos do admin). Não mostra nada. */
export function ContadorAcessos() {
  const caminho = usePathname();
  useEffect(() => {
    if (caminho.startsWith("/equipe")) return; // a área da equipe não conta
    const corpo = JSON.stringify({ caminho });
    const blob = new Blob([corpo], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/v1/acessos", blob))
      fetch("/api/v1/acessos", { method: "POST", body: corpo, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(
        () => {},
      );
  }, [caminho]);
  return null;
}
