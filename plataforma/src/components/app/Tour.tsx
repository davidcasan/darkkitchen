"use client";

import { type DriveStep, driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour.css";
import { useEffect, useRef } from "react";
import { marcarTourVistoAction } from "@/app/actions/conta";
import { type IdTour, type PassoTour, TOURS } from "@/domain/tours";

// Tours guiados do cliente (driver.js): balões apontando para cada parte da tela.
// TourAutomatico abre na primeira vez; BotaoTour ("?") refaz o tour quando o cliente quiser.

/** Primeiro elemento visível que combina com o seletor (o menu lateral some no celular, etc.). */
function visivel(seletor: string): Element | undefined {
  return [...document.querySelectorAll(seletor)].find((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
  });
}

let tourAtivo = false;

export function iniciarTour(id: IdTour, aoTerminar?: () => void) {
  if (tourAtivo) return;
  const passos: DriveStep[] = [];
  for (const p of TOURS[id] as PassoTour[]) {
    const alvo = p.alvo ? visivel(p.alvo) : undefined;
    if (p.alvo && !alvo) continue;
    passos.push({ element: alvo, popover: { title: p.titulo, description: p.texto, side: p.lado } });
  }
  if (!passos.some((p) => p.element)) return; // nada desta tela está à vista
  tourAtivo = true;
  const d = driver({
    steps: passos,
    showProgress: true,
    progressText: "{{current}} de {{total}}",
    nextBtnText: "Próximo",
    prevBtnText: "Voltar",
    doneBtnText: "Concluir",
    popoverClass: "dk-tour",
    overlayOpacity: 0.72,
    stagePadding: 6,
    stageRadius: 12,
    smoothScroll: true,
    onPopoverRender: (popover) => {
      // "Pular" em todo balão, além do × e da tecla Esc.
      const pular = document.createElement("button");
      pular.type = "button";
      pular.className = "dk-tour-pular";
      pular.textContent = "Pular tour";
      pular.addEventListener("click", () => d.destroy());
      popover.footer.insertBefore(pular, popover.footer.firstChild);
    },
    onDestroyed: () => {
      tourAtivo = false;
      aoTerminar?.();
    },
  });
  d.drive();
}

/** Abre o tour sozinho na primeira vez que o cliente vê esta tela; concluir ou pular marca como visto. */
export function TourAutomatico({ id, visto, aoVer }: { id: IdTour; visto: boolean; aoVer?: (id: IdTour) => void }) {
  const iniciado = useRef(false);
  useEffect(() => {
    if (visto || iniciado.current) return;
    iniciado.current = true;
    const t = setTimeout(
      () =>
        iniciarTour(id, () => {
          aoVer?.(id);
          void marcarTourVistoAction(id);
        }),
      500,
    );
    return () => {
      clearTimeout(t);
      iniciado.current = false;
    };
  }, [id, visto, aoVer]);
  return null;
}

/** Botão "?" que refaz o tour desta tela. */
export function BotaoTour({ id, rotulo = "Ver o tour desta página" }: { id: IdTour; rotulo?: string }) {
  return (
    <button type="button" className="dk-tour-botao" data-tour="tour" onClick={() => iniciarTour(id)} title={rotulo} aria-label={rotulo}>
      ?
    </button>
  );
}
