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
import { aplicarPersonalizado, cancelarCobranca, confirmarPagamento } from "@/server/services/assinaturas";
import { salvarConfigPix } from "@/server/services/pix";
import { definirPadraoPrecos, salvarPrecos } from "@/server/services/precos";
import { usuarioPorId } from "@/server/services/usuarios";
import { criarPerfil, moverPerfil, removerPerfil, salvarPerfil } from "@/server/services/perfis";
import { desligarTelegram, linkParaLigar } from "@/server/services/telegram";
import { salvarTermos } from "@/server/services/termos";
import { gerarParaPedido, salvarConfigIaComp } from "@/server/services/iaComp";

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
  const saida: { quando?: "agora" | "renovacao" | "aguardando_pix" } = {};
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
        : saida.quando === "aguardando_pix"
          ? "Plano Personalizado liberado: o cliente já vê o QR Code do Pix. Os créditos entram quando você confirmar o pagamento em Pagamentos."
          : "Plano Personalizado aplicado: cobrança feita no cartão, créditos lançados e novo período iniciado hoje. O cliente foi avisado.",
  };
}

export async function confirmarPagamentoAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  return rodar(() => confirmarPagamento(u, campoNumero(fd, "fatura")), "Pagamento confirmado. Os créditos foram liberados e o cliente foi avisado.");
}

export async function cancelarCobrancaAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  return rodar(() => cancelarCobranca(u, campoNumero(fd, "fatura")), "Cobrança cancelada. O cliente foi avisado.");
}

export async function salvarPixAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  return rodar(
    () => salvarConfigPix(u, { chave: campo(fd, "chave"), nome: campo(fd, "nome"), cidade: campo(fd, "cidade") }),
    "Dados do Pix salvos. Os próximos QR Codes já usam estes dados.",
  );
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

export async function definirPadraoPrecosAction(): Promise<Estado> {
  const u = await admin();
  const r = await rodar(() => definirPadraoPrecos(u));
  return r?.erro ? r : { ok: "Os preços atuais agora são o padrão. \"Restaurar padrão\" volta para eles." };
}

// ---------- Quem somos ----------

export async function criarPerfilAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  return rodar(() => criarPerfil(u, { nome: campo(fd, "nome"), funcao: campo(fd, "funcao"), bio: campo(fd, "bio") }), "Perfil criado.");
}

export async function salvarPerfilAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  return rodar(
    () =>
      salvarPerfil(u, campoNumero(fd, "id"), {
        nome: campo(fd, "nome"),
        funcao: campo(fd, "funcao"),
        bio: campo(fd, "bio"),
        visivel: campo(fd, "visivel") === "1",
        titulo16x9: campo(fd, "titulo_16x9"),
        titulo9x16: campo(fd, "titulo_9x16"),
      }),
    "Perfil salvo.",
  );
}

export async function moverPerfilAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  return rodar(() => moverPerfil(u, campoNumero(fd, "id"), campo(fd, "direcao") === "-1" ? -1 : 1));
}

export async function removerPerfilAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  return rodar(() => removerPerfil(u, campoNumero(fd, "id")), "Perfil removido.");
}

// ---------- Telegram ----------

/** Link de uso único para ligar o Telegram deste admin ao atendimento. */
export async function linkTelegramAction(): Promise<{ url?: string; erro?: string }> {
  const u = await admin();
  try {
    return { url: await linkParaLigar(u) };
  } catch (e) {
    return { erro: e instanceof ErroNegocio ? e.message : "Não foi possível gerar o link." };
  }
}

export async function desligarTelegramAction(): Promise<Estado> {
  const u = await admin();
  return rodar(() => desligarTelegram(u), "Telegram desligado.");
}

// ---------- Termos de Uso ----------

export async function salvarTermosAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  let versao = 0;
  const r = await rodar(() => {
    versao = salvarTermos(u, campo(fd, "texto"));
  });
  return r?.erro ? r : { ok: `Versão ${versao} publicada. Novos cadastros passam a aceitar esta versão.` };
}

// ---------- IA Comp ----------

export async function salvarIaCompAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  return rodar(
    () =>
      salvarConfigIaComp(u, {
        ativo: campo(fd, "ativo") === "1",
        modo: campo(fd, "modo") === "operaria" ? "operaria" : "kit",
        usarIA: campo(fd, "usarIA") === "1",
      }),
    "Configuração da IA Comp salva.",
  );
}

export async function gerarIaCompAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await admin();
  return rodar(() => gerarParaPedido(u, campoNumero(fd, "pedido")), "Na fila. Em até 1 minuto começa a gerar; atualize a página.");
}
