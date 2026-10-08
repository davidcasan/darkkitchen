"use server";

import { type Estado, campo, campoNumero, rodar, rodarEIr } from "@/server/acao";
import { exigirUsuario } from "@/server/auth";
import {
  aprovarQualidade,
  atribuirDesigner,
  cancelarPedido,
  concluirPorGerente,
  enviarVersao,
  reprovarQualidade,
} from "@/server/services/pedidos";

const equipe = () => exigirUsuario(["designer", "gerente", "diretor", "admin"]);
const paginaPedido = (fd: FormData) => `/equipe/pedidos/${campoNumero(fd, "pedido")}`;

export async function atribuirAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await equipe();
  return rodarEIr(() => atribuirDesigner(u, campoNumero(fd, "pedido"), campoNumero(fd, "designer")), paginaPedido(fd), "atribuido");
}

/** Chamado depois do upload do vídeo (e dos arquivos de entrega) pela API. */
export async function enviarVersaoAction(pedidoId: number, arquivoId: number, extras: number[], nota: string): Promise<Estado> {
  const u = await equipe();
  return rodar(() => enviarVersao(u, pedidoId, { arquivoId, extras, nota }));
}

export async function aprovarQualidadeAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await equipe();
  return rodarEIr(() => aprovarQualidade(u, campoNumero(fd, "pedido"), campo(fd, "nota")), paginaPedido(fd), "qa_aprovada");
}

export async function reprovarQualidadeAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await equipe();
  return rodarEIr(
    () =>
      reprovarQualidade(u, campoNumero(fd, "pedido"), {
        tipoErro: campo(fd, "tipoErro"),
        cena: campo(fd, "cena"),
        minutagem: campo(fd, "minutagem"),
        texto: campo(fd, "texto"),
      }),
    paginaPedido(fd),
    "qa_reprovada",
  );
}

export async function cancelarEquipeAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await equipe();
  return rodarEIr(
    () => cancelarPedido(u, campoNumero(fd, "pedido"), campo(fd, "erroPlataforma") === "1"),
    paginaPedido(fd),
    "cancelado",
  );
}

export async function concluirAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await equipe();
  return rodarEIr(() => concluirPorGerente(u, campoNumero(fd, "pedido"), campo(fd, "motivo")), paginaPedido(fd), "concluido");
}
