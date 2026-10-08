import "server-only";
import { NextResponse } from "next/server";
import { ErroNegocio } from "./db";
import { type Usuario, usuarioDaRequisicao } from "./auth";

// Utilitários da API REST (/api/v1). Respostas sempre em JSON:
// sucesso → { dados }, erro → { erro: "mensagem" } com o status HTTP adequado.

export const ok = (dados: unknown, status = 200) => NextResponse.json({ dados }, { status });

export const falha = (mensagem: string, status = 400) => NextResponse.json({ erro: mensagem }, { status });

/** Envolve um handler: exige login e converte erros de negócio em respostas JSON. */
export function comUsuario<C>(handler: (req: Request, usuario: Usuario, ctx: C) => Promise<Response> | Response) {
  return async (req: Request, ctx: C) => {
    const usuario = usuarioDaRequisicao(req);
    if (!usuario) return falha("Faça login para continuar.", 401);
    try {
      return await handler(req, usuario, ctx);
    } catch (e) {
      return tratarErro(e);
    }
  };
}

export function tratarErro(e: unknown) {
  if (e instanceof ErroNegocio) return falha(e.message, e.status);
  console.error(e);
  return falha("Erro inesperado no servidor.", 500);
}
