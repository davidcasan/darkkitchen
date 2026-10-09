import "server-only";
import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Papel } from "@/domain/pedido";
import { ehEquipe } from "@/domain/pedido";
import { executar, um } from "./db";
import { agoraSql, paraSql } from "./datas";

// Sessão por token. No navegador o token viaja num cookie httpOnly; no app
// mobile (futuro) ele vai no cabeçalho "Authorization: Bearer <token>".
// O banco guarda só o hash do token, nunca o token em si.

export const COOKIE_SESSAO = "dk_sessao";
const DIAS_SESSAO = 30;

export interface Usuario {
  id: number;
  papel: Papel;
  nome: string;
  email: string;
  empresa: string | null;
  senior: number;
}

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export function criarSessao(usuarioId: number): { token: string; expira: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + DIAS_SESSAO * 86400_000);
  executar("INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)", hashToken(token), usuarioId, paraSql(expira));
  return { token, expira };
}

export function usuarioPorToken(token: string | undefined | null): Usuario | null {
  if (!token) return null;
  return (
    um<Usuario>(
      `SELECT u.id, u.papel, u.nome, u.email, u.empresa, u.senior FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = ? AND s.expira_em > ? AND u.ativo = 1`,
      hashToken(token),
      agoraSql(),
    ) ?? null
  );
}

export function encerrarSessao(token: string | undefined | null) {
  if (token) executar("DELETE FROM sessoes WHERE token_hash = ?", hashToken(token));
}

/** Para Route Handlers da API: aceita Bearer token ou o cookie do navegador. */
export function usuarioDaRequisicao(req: Request): Usuario | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return usuarioPorToken(auth.slice(7).trim());
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_SESSAO}=([^;]+)`));
  return usuarioPorToken(m ? decodeURIComponent(m[1]) : null);
}

// ---- Navegador (páginas e Server Actions) ----

export const usuarioAtual = cache(async (): Promise<Usuario | null> => {
  const jar = await cookies();
  return usuarioPorToken(jar.get(COOKIE_SESSAO)?.value);
});

export const areaDo = (papel: Papel) => (ehEquipe(papel) ? "/equipe" : "/cliente");

/** Exige login (e, opcionalmente, um dos papéis). Redireciona se não atender. */
export async function exigirUsuario(papeis?: Papel[]): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) redirect("/entrar");
  if (papeis && !papeis.includes(u.papel)) redirect(areaDo(u.papel));
  return u;
}

export async function iniciarSessaoWeb(usuarioId: number) {
  const { token, expira } = criarSessao(usuarioId);
  const jar = await cookies();
  jar.set(COOKIE_SESSAO, token, opcoesCookie(expira));
}

export async function encerrarSessaoWeb() {
  const jar = await cookies();
  encerrarSessao(jar.get(COOKIE_SESSAO)?.value);
  encerrarSessao(jar.get(COOKIE_ADMIN)?.value);
  jar.delete(COOKIE_SESSAO);
  jar.delete(COOKIE_ADMIN);
}

// ---- "Acessar como": o admin entra na conta de outro usuário ----
// A sessão do admin fica guardada num segundo cookie e é restaurada em "Voltar ao admin".

const COOKIE_ADMIN = "dk_admin";

const opcoesCookie = (expira: Date) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" && process.env.COOKIE_INSEGURO !== "1",
  path: "/",
  expires: expira,
});

/** Admin que está acessando a conta atual (null se é um login normal). */
export const adminOriginal = cache(async (): Promise<Usuario | null> => {
  const jar = await cookies();
  const admin = usuarioPorToken(jar.get(COOKIE_ADMIN)?.value);
  return admin?.papel === "admin" ? admin : null;
});

export async function acessarComo(admin: Usuario, alvo: Usuario) {
  const jar = await cookies();
  const tokenAdmin = jar.get(COOKIE_SESSAO)?.value;
  if (!tokenAdmin || admin.papel !== "admin") return;
  const { token, expira } = criarSessao(alvo.id);
  jar.set(COOKIE_ADMIN, tokenAdmin, opcoesCookie(expira));
  jar.set(COOKIE_SESSAO, token, opcoesCookie(expira));
}

/** Encerra a sessão "como outro usuário" e devolve o admin à própria conta. */
export async function voltarAoAdmin(): Promise<boolean> {
  const jar = await cookies();
  const tokenAdmin = jar.get(COOKIE_ADMIN)?.value;
  const admin = usuarioPorToken(tokenAdmin);
  if (!tokenAdmin || admin?.papel !== "admin") return false;
  encerrarSessao(jar.get(COOKIE_SESSAO)?.value);
  jar.set(COOKIE_SESSAO, tokenAdmin, opcoesCookie(new Date(Date.now() + DIAS_SESSAO * 86400_000)));
  jar.delete(COOKIE_ADMIN);
  return true;
}
