"use server";

import { type Estado, campo, campoNumero, rodar, rodarEIr } from "@/server/acao";
import { exigirUsuario } from "@/server/auth";
import { redirect } from "next/navigation";
import { ErroNegocio } from "@/server/db";
import { atualizarMarca, criarMarca, removerMarca } from "@/server/services/marcas";
import { removerArquivoDaMarca } from "@/server/services/arquivos";
import {
  type ResultadoTroca,
  avisarPagamento,
  definirRenovacao,
  gerarPixDeNovo,
  pagarRenovacaoAgora,
  trocarPlano,
} from "@/server/services/assinaturas";
import { formatarReais } from "@/domain/catalogo";
import { formatarData } from "@/server/datas";
import { CARTAO_ATIVO, adicionarMetodo, definirPadrao, removerMetodo } from "@/server/services/pagamentos";
import { pixDisponivel } from "@/server/services/pix";
import {
  cancelarPedido,
  clienteAprovar,
  clientePedirAjuste,
  clienteRejeitar,
  criarPedido,
} from "@/server/services/pedidos";

const cliente = () => exigirUsuario(["cliente"]);

/** Chamado pelo formulário de briefing com o briefing completo. */
export async function criarPedidoAction(briefing: unknown): Promise<Estado> {
  const u = await cliente();
  return rodar(() => criarPedido(u, briefing).id);
}

const paginaPedido = (fd: FormData) => `/cliente/pedidos/${campoNumero(fd, "pedido")}`;

export async function aprovarAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await cliente();
  return rodarEIr(() => clienteAprovar(u, campoNumero(fd, "pedido")), paginaPedido(fd), "aprovado");
}

export async function ajusteAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await cliente();
  return rodarEIr(
    () =>
      clientePedirAjuste(u, campoNumero(fd, "pedido"), {
        texto: campo(fd, "texto"),
        aceitaCobranca: campo(fd, "aceita") === "1",
      }),
    paginaPedido(fd),
    "ajuste",
  );
}

export async function rejeitarAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await cliente();
  return rodarEIr(
    () => clienteRejeitar(u, campoNumero(fd, "pedido"), { motivo: campo(fd, "motivo"), texto: campo(fd, "texto") }),
    paginaPedido(fd),
    "rejeitado",
  );
}

export async function cancelarPedidoAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await cliente();
  return rodarEIr(() => cancelarPedido(u, campoNumero(fd, "pedido")), paginaPedido(fd), "cancelado");
}

export async function trocarPlanoAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await cliente();
  const saida: { r?: ResultadoTroca } = {};
  const r = await rodar(() => {
    saida.r = trocarPlano(u.id, campo(fd, "plano"));
  });
  if (r?.erro || !saida.r) return r;
  const t = saida.r;
  switch (t.tipo) {
    case "upgrade":
      return {
        ok: `Pronto! Você agora está no plano ${t.plano}. ${t.creditos} créditos já entraram no seu saldo${
          t.cobrado > 0 ? ` e cobramos ${formatarReais(t.cobrado)} (diferença entre os planos)` : ""
        }.`,
      };
    case "agendada":
      return { ok: `Troca agendada: seu plano muda para ${t.plano} na renovação de ${formatarData(t.em)}. Até lá, nada muda.` };
    case "cancelou_agendamento":
      return { ok: `Troca cancelada. Você continua no plano ${t.plano}.` };
    case "upgrade_pix":
      return {
        ok: `Pronto! Pague o Pix de ${formatarReais(t.valor)} que apareceu abaixo. Assim que confirmarmos o pagamento, você passa para o plano ${t.plano} e ${t.creditos} créditos entram no saldo.`,
      };
    case "assinou_pix":
      return { ok: `Assinatura do plano ${t.plano} criada. Pague o Pix para ativar: os créditos entram assim que confirmarmos o pagamento.` };
    default:
      return { ok: `Assinatura do plano ${t.plano} ativada.` };
  }
}

export async function renovacaoAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await cliente();
  const ligar = campo(fd, "ligar") === "1";
  return rodar(
    () => definirRenovacao(u.id, ligar),
    ligar
      ? "Renovação automática ligada. Nada foi cobrado agora; a próxima cobrança é na data de renovação."
      : "Renovação automática desligada. Sua assinatura vale até o fim do período e os créditos não usados expiram nessa data.",
  );
}

export async function avisarPagamentoAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await cliente();
  return rodar(() => avisarPagamento(u.id, campoNumero(fd, "fatura")), "Obrigado! Avisamos a equipe. Assim que o pagamento for confirmado, os créditos entram.");
}

export async function gerarPixAction(): Promise<Estado> {
  const u = await cliente();
  return rodar(() => gerarPixDeNovo(u.id), "Novo Pix gerado.");
}

export async function pagarRenovacaoAction(): Promise<Estado> {
  const u = await cliente();
  const r = await rodar(() => pagarRenovacaoAgora(u.id));
  if (r?.erro) return r;
  // O aviso de pagamento pendente some da tela; a confirmação vai pela URL.
  redirect("/cliente/conta?ok=pago");
}

export async function adicionarMetodoAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await cliente();
  return rodar(() => {
    const tipo = campo(fd, "tipo") === "pix" ? "pix" : "cartao";
    if (tipo === "pix" && !pixDisponivel()) throw new ErroNegocio("O pagamento por Pix ainda não está disponível.");
    if (tipo === "cartao" && !CARTAO_ATIVO) throw new ErroNegocio("Por enquanto, os pagamentos são só por Pix.");
    if (tipo === "cartao" && !/^\d{4}$/.test(campo(fd, "final")))
      throw new ErroNegocio("Informe os 4 últimos dígitos do cartão.");
    adicionarMetodo(u.id, tipo, campo(fd, "final"));
  }, "Forma de pagamento adicionada.");
}

export async function metodoPadraoAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await cliente();
  return rodar(() => definirPadrao(u.id, campoNumero(fd, "metodo")));
}

export async function removerMetodoAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await cliente();
  return rodar(() => removerMetodo(u.id, campoNumero(fd, "metodo")));
}

export async function salvarMarcaAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await cliente();
  return rodar(
    () =>
      atualizarMarca(u, campoNumero(fd, "marca"), {
        nome: campo(fd, "nome"),
        cores: fd.getAll("cor").filter((c): c is string => typeof c === "string"),
        observacoes: campo(fd, "observacoes"),
      }),
    "Marca salva.",
  );
}

/** Nova marca pela página de marcas: cria e abre a página dela. */
export async function novaMarcaAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await cliente();
  const saida: { id?: number } = {};
  const r = await rodar(() => {
    saida.id = criarMarca(u.id, campo(fd, "nome"));
  });
  if (r?.erro || !saida.id) return r;
  redirect(`/cliente/marcas/${saida.id}`);
}

/** Nova marca de dentro do briefing: devolve o id para o formulário continuar. */
export async function criarMarcaNoBriefingAction(nome: string): Promise<Estado> {
  const u = await cliente();
  return rodar(() => criarMarca(u.id, nome));
}

export async function removerMarcaAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await cliente();
  const r = await rodar(() => removerMarca(u, campoNumero(fd, "marca")));
  if (r?.erro) return r;
  redirect("/cliente/marcas?ok=removida");
}

export async function removerArquivoMarcaAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await cliente();
  return rodar(() => removerArquivoDaMarca(u, campoNumero(fd, "arquivo")));
}
