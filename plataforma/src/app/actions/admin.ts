"use server";

import { redirect } from "next/navigation";
import { type Estado, campo, campoNumero, rodar } from "@/server/acao";
import { acessarComo, areaDo, exigirUsuario, voltarAoAdmin } from "@/server/auth";
import { ErroNegocio, um } from "@/server/db";
import {
  ajustarCreditos,
  atualizarConta,
  criarConta,
  reativarConta,
  redefinirSenha,
  removerConta,
} from "@/server/services/contas";
import { aplicarPersonalizado } from "@/server/services/assinaturas";
import { salvarPrecos } from "@/server/services/precos";
import { usuarioPorId } from "@/server/services/usuarios";

const admin = () => exigirUsuario(["admin"]);

const dados = (fd: FormData) => ({
  nome: campo(fd, "nome"),
  email: campo(fd, "email"),
  papel: campo(fd, "papel"),
  empresa: campo(fd, "empresa"),
  senior: campo(fd, "senior") === "1",
});

export async function criarContaAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  const saida: { conta?: { id: number; senha: string } } = {};
  const r = await rodar(() => {
    saida.conta = criarConta(u, { ...dados(fd), senha: campo(fd, "senha"), creditos: campoNumero(fd, "creditos") });
  });
  if (r?.erro || !saida.conta) return r;
  const { id, senha } = saida.conta;
  return { ok: `Conta criada. Senha de acesso: ${senha} (anote agora; ela não aparece de novo).`, id };
}

export async function atualizarContaAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  return rodar(() => atualizarConta(u, campoNumero(fd, "id"), dados(fd)), "Dados salvos.");
}

export async function redefinirSenhaAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  let senha = "";
  const r = await rodar(() => {
    senha = redefinirSenha(u, campoNumero(fd, "id"));
  });
  return r?.erro
    ? r
    : { ok: `Nova senha temporária: ${senha} (anote e envie à pessoa; as sessões abertas dela foram encerradas).` };
}

export async function removerContaAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  let resultado = "";
  const r = await rodar(() => {
    resultado = removerConta(u, campoNumero(fd, "id"));
  });
  if (r?.erro) return r;
  if (resultado === "removida") redirect("/equipe/contas?ok=removida");
  redirect(`/equipe/contas/${campoNumero(fd, "id")}?ok=desativada`);
}

export async function reativarContaAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  const r = await rodar(() => reativarConta(u, campoNumero(fd, "id")));
  if (r?.erro) return r;
  redirect(`/equipe/contas/${campoNumero(fd, "id")}?ok=reativada`);
}

export async function personalizadoAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  const saida: { quando?: "agora" | "renovacao" } = {};
  const r = await rodar(() => {
    saida.quando = aplicarPersonalizado(u, campoNumero(fd, "id"), {
      precoMes: Number(campo(fd, "preco").replace(",", ".")),
      creditosMes: Number(campo(fd, "creditos")),
      quando: campo(fd, "quando") === "renovacao" ? "renovacao" : "agora",
    });
  });
  if (r?.erro) return r;
  return {
    ok:
      saida.quando === "renovacao"
        ? "Plano Personalizado agendado: começa na próxima renovação do cliente. Ele foi avisado."
        : "Plano Personalizado aplicado: cobrança feita, créditos lançados e novo período iniciado hoje. O cliente foi avisado.",
  };
}

export async function ajustarCreditosAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  const q = campoNumero(fd, "quantidade");
  return rodar(
    () => ajustarCreditos(u, campoNumero(fd, "id"), q, campo(fd, "motivo")),
    `${q > 0 ? `+${q}` : q} créditos lançados no extrato do cliente.`,
  );
}

/** Admin entra na conta de outra pessoa para agir como ela. */
export async function acessarComoAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  let destino = "/";
  const r = await rodar(async () => {
    const alvo = usuarioPorId(campoNumero(fd, "id"));
    if (!alvo) throw new ErroNegocio("Conta não encontrada.");
    if (alvo.id === u.id) throw new ErroNegocio("Você já está na sua conta.");
    if (!um("SELECT 1 FROM usuarios WHERE id = ? AND ativo = 1", alvo.id)) throw new ErroNegocio("Reative a conta antes de acessá-la.");
    await acessarComo(u, alvo);
    destino = areaDo(alvo.papel);
  });
  if (r?.erro) return r;
  redirect(destino);
}

export async function voltarAoAdminAction() {
  await voltarAoAdmin();
  redirect("/equipe/contas");
}

/** Salva a tabela de preços inteira (vinda do editor). */
export async function salvarPrecosAction(tabela: unknown): Promise<Estado> {
  const u = await admin();
  let resumo = "";
  const r = await rodar(() => {
    resumo = salvarPrecos(u, tabela);
  });
  return r?.erro ? r : { ok: resumo === "Nada mudou." ? resumo : `Preços atualizados: ${resumo}.` };
}
