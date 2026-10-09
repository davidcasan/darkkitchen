"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type Estado, campo, rodar } from "@/server/acao";
import { areaDo, encerrarSessaoWeb, exigirUsuario, iniciarSessaoWeb } from "@/server/auth";
import { ErroNegocio, executar } from "@/server/db";
import { PLANO_PERSONALIZADO } from "@/domain/precos";
import { alterarSenha, autenticar, cadastrarCliente } from "@/server/services/usuarios";
import { marcarTodasLidas } from "@/server/services/notificacoes";
import { registrarLogin } from "@/server/services/acessos";
import { type PreferenciaEmail, PREFERENCIAS_EMAIL } from "@/server/services/email";
import { enderecoConfiavel, pedirRecuperacao, redefinirSenha } from "@/server/services/recuperacao";

export async function entrarAction(_: Estado, fd: FormData): Promise<Estado> {
  let destino = "/";
  const r = await rodar(async () => {
    const u = autenticar(campo(fd, "email"), campo(fd, "senha"));
    await iniciarSessaoWeb(u.id);
    registrarLogin(u, "site");
    destino = areaDo(u.papel);
  });
  if (r?.erro) return r;
  redirect(destino);
}

export async function cadastrarAction(_: Estado, fd: FormData): Promise<Estado> {
  const r = await rodar(async () => {
    const metodo = campo(fd, "metodo") === "pix" ? "pix" : "cartao";
    const final = campo(fd, "final");
    const personalizado = campo(fd, "plano") === PLANO_PERSONALIZADO; // sem pagamento no cadastro
    if (!personalizado && metodo === "cartao" && !/^\d{4}$/.test(final))
      throw new ErroNegocio("Informe os 4 últimos dígitos do cartão.");
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
    registrarLogin(u, "cadastro");
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

/** "Esqueci minha senha": manda o link por e-mail. A resposta é sempre a mesma (não revela contas). */
export async function pedirRecuperacaoAction(_: Estado, fd: FormData): Promise<Estado> {
  const email = campo(fd, "email").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { erro: "Digite um e-mail válido." };
  const h = await headers();
  const base = enderecoConfiavel(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
  const r = await rodar(() => pedirRecuperacao(email, base));
  if (r?.erro) return r;
  return {
    ok: "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha. Ele vale por 1 hora. Confira também a caixa de spam.",
  };
}

export async function redefinirSenhaAction(_: Estado, fd: FormData): Promise<Estado> {
  const r = await rodar(() => redefinirSenha(campo(fd, "token"), campo(fd, "nova"), campo(fd, "confirma")));
  if (r?.erro) return r;
  redirect("/entrar?ok=senha");
}

export async function preferenciaEmailAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  const p = campo(fd, "email_avisos") as PreferenciaEmail;
  if (!(p in PREFERENCIAS_EMAIL)) return { erro: "Escolha uma opção." };
  return rodar(
    () => executar("UPDATE usuarios SET email_avisos = ? WHERE id = ?", p, u.id),
    p === "nenhum"
      ? "Pronto. Você não vai receber avisos por e-mail; eles continuam no sininho da plataforma."
      : `Pronto. Você vai receber por e-mail: ${PREFERENCIAS_EMAIL[p].toLowerCase()}.`,
  );
}
