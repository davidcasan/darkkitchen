import "server-only";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import type { CodigoMensagem } from "@/domain/mensagens";
import { ErroNegocio } from "./db";

// Base das Server Actions: roda a regra de negócio e devolve um estado simples
// para a tela mostrar ({ erro } ou { ok }). Redirecionamentos do Next passam direto.

export type Estado = { erro?: string; ok?: string; id?: number } | null;

export async function rodar(fn: () => unknown, mensagemOk?: string): Promise<Estado> {
  try {
    const r = await fn();
    revalidatePath("/", "layout");
    return { ok: mensagemOk, ...(typeof r === "number" ? { id: r } : {}) };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ErroNegocio) return { erro: e.message };
    console.error(e);
    return { erro: "Algo deu errado. Tente de novo." };
  }
}

/** Roda a ação e, se der certo, volta para a página com a mensagem de confirmação. */
export async function rodarEIr(fn: () => unknown, destino: string, mensagem: CodigoMensagem): Promise<Estado> {
  const r = await rodar(fn);
  if (r?.erro) return r;
  redirect(`${destino}?ok=${mensagem}`);
}

export const campo = (fd: FormData, nome: string) => {
  const v = fd.get(nome);
  return typeof v === "string" ? v : "";
};

export const campoNumero = (fd: FormData, nome: string) => Number(campo(fd, nome)) || 0;
