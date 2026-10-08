"use server";

import { redirect } from "next/navigation";
import { type Estado, campo, rodar } from "@/server/acao";
import { areaDo, encerrarSessaoWeb, exigirUsuario, iniciarSessaoWeb } from "@/server/auth";
import { ErroNegocio } from "@/server/db";
import { alterarSenha, autenticar, cadastrarCliente } from "@/server/services/usuarios";
import { marcarTodasLidas } from "@/server/services/notificacoes";

export async function entrarAction(_: Estado, fd: FormData): Promise<Estado> {
  let destino = "/";
  const r = await rodar(async () => {
    const u = autenticar(campo(fd, "email"), campo(fd, "senha"));
    await iniciarSessaoWeb(u.id);
    destino = areaDo(u.papel);
  });
  if (r?.erro) return r;
  redirect(destino);
}

export async function cadastrarAction(_: Estado, fd: FormData): Promise<Estado> {
  const r = await rodar(async () => {
    const metodo = campo(fd, "metodo") === "pix" ? "pix" : "cartao";
    const final = campo(fd, "final");
    if (metodo === "cartao" && !/^\d{4}$/.test(final)) throw new ErroNegocio("Informe os 4 últimos dígitos do cartão.");
    const u = cadastrarCliente({
      nome: campo(fd, "nome"),
      empresa: campo(fd, "empresa"),
      email: campo(fd, "email"),
      senha: campo(fd, "senha"),
      planoId: campo(fd, "plano"),
      metodo,
      cartaoFinal: final,
    });
    await iniciarSessaoWeb(u.id);
  });
  if (r?.erro) return r;
  redirect("/cliente?bemvindo=1");
}

export async function sairAction() {
  await encerrarSessaoWeb();
  redirect("/");
}

export async function alterarSenhaAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return rodar(() => {
    if (campo(fd, "nova") !== campo(fd, "confirma")) throw new ErroNegocio("A confirmação não confere com a nova senha.");
    alterarSenha(u.id, campo(fd, "atual"), campo(fd, "nova"));
  }, "Senha alterada.");
}

export async function marcarLidasAction() {
  const u = await exigirUsuario();
  await rodar(() => marcarTodasLidas(u.id));
}
