import "server-only";
import { type IdTour, ehTour } from "@/domain/tours";
import { ErroNegocio, executar, um } from "../db";

// Tours guiados do cliente: quais ele já viu (concluiu ou pulou). Lista JSON em usuarios.tours_vistos.

export function toursVistos(usuarioId: number): IdTour[] {
  const v = um<{ t: string | null }>("SELECT tours_vistos t FROM usuarios WHERE id = ?", usuarioId)?.t;
  try {
    const lista = v ? (JSON.parse(v) as string[]) : [];
    return lista.filter(ehTour);
  } catch {
    return [];
  }
}

export function marcarTourVisto(usuarioId: number, id: string) {
  if (!ehTour(id)) throw new ErroNegocio("Tour desconhecido.");
  const vistos = new Set(toursVistos(usuarioId));
  if (vistos.has(id)) return;
  vistos.add(id);
  executar("UPDATE usuarios SET tours_vistos = ? WHERE id = ?", JSON.stringify([...vistos]), usuarioId);
}

/** Todos os tours voltam a abrir sozinhos (botão na Conta). */
export function reiniciarTours(usuarioId: number) {
  executar("UPDATE usuarios SET tours_vistos = '[]' WHERE id = ?", usuarioId);
}
