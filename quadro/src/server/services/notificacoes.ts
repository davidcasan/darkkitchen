import "server-only";
import type { Papel } from "@/domain/pedido";
import { executar, varios, um } from "../db";

// Notificações dentro da plataforma. É o ponto único de aviso: quando houver
// e-mail ou push (app), basta enviar também a partir daqui.

export interface Notificacao {
  id: number;
  texto: string;
  link: string | null;
  lida: number;
  criado_em: string;
}

export function notificar(usuarioId: number, texto: string, link?: string) {
  executar("INSERT INTO notificacoes (usuario_id, texto, link) VALUES (?, ?, ?)", usuarioId, texto, link ?? null);
}

export function notificarPapel(papeis: Papel[], texto: string, link?: string) {
  const ids = varios<{ id: number }>(
    `SELECT id FROM usuarios WHERE papel IN (${papeis.map(() => "?").join(",")})`,
    ...papeis,
  );
  for (const { id } of ids) notificar(id, texto, link);
}

export const listarNotificacoes = (usuarioId: number, limite = 20) =>
  varios<Notificacao>("SELECT * FROM notificacoes WHERE usuario_id = ? ORDER BY id DESC LIMIT ?", usuarioId, limite);

export const contarNaoLidas = (usuarioId: number) =>
  um<{ n: number }>("SELECT COUNT(*) n FROM notificacoes WHERE usuario_id = ? AND lida = 0", usuarioId)?.n ?? 0;

export const marcarTodasLidas = (usuarioId: number) =>
  executar("UPDATE notificacoes SET lida = 1 WHERE usuario_id = ? AND lida = 0", usuarioId);
