import "server-only";
import type { Papel } from "@/domain/pedido";
import { executar, varios, um } from "../db";
import { enfileirarEmailDeAviso } from "./email";

// Notificações dentro da plataforma. É o ponto único de aviso: cada notificação também
// vira e-mail (services/email.ts; contas de teste não recebem). Push do app entra aqui.

export interface Notificacao {
  id: number;
  texto: string;
  link: string | null;
  lida: number;
  criado_em: string;
}

/**
 * email: false → só no sininho, sem e-mail (ex.: comentários do cliente).
 * importante: true → sai por e-mail também para quem escolheu receber só os importantes.
 */
export interface OpcoesAviso {
  email?: boolean;
  importante?: boolean;
}

export const IMPORTANTE: OpcoesAviso = { importante: true };
export const SEM_EMAIL: OpcoesAviso = { email: false };

export function notificar(usuarioId: number, texto: string, link?: string, opcoes: OpcoesAviso = {}) {
  executar("INSERT INTO notificacoes (usuario_id, texto, link) VALUES (?, ?, ?)", usuarioId, texto, link ?? null);
  if (opcoes.email !== false) enfileirarEmailDeAviso(usuarioId, texto, link, !!opcoes.importante);
}

export function notificarPapel(papeis: Papel[], texto: string, link?: string, opcoes: OpcoesAviso = {}) {
  const ids = varios<{ id: number }>(
    `SELECT id FROM usuarios WHERE ativo = 1 AND papel IN (${papeis.map(() => "?").join(",")})`,
    ...papeis,
  );
  for (const { id } of ids) notificar(id, texto, link, opcoes);
}

export const listarNotificacoes = (usuarioId: number, limite = 20) =>
  varios<Notificacao>("SELECT * FROM notificacoes WHERE usuario_id = ? ORDER BY id DESC LIMIT ?", usuarioId, limite);

export const contarNaoLidas = (usuarioId: number) =>
  um<{ n: number }>("SELECT COUNT(*) n FROM notificacoes WHERE usuario_id = ? AND lida = 0", usuarioId)?.n ?? 0;

export const marcarTodasLidas = (usuarioId: number) =>
  executar("UPDATE notificacoes SET lida = 1 WHERE usuario_id = ? AND lida = 0", usuarioId);
