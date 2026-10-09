import "server-only";
import crypto from "node:crypto";
import { ErroNegocio, executar, um, varios } from "../db";

// Pagamentos. Toda cobrança passa por um "gateway". Hoje o gateway é
// simulado (sem dinheiro real): aprova na hora, exceto cartão com final 0000,
// que é sempre recusado (para testar a cobrança recusada). Para cobrar de verdade,
// implemente a interface Gateway com Asaas, Pagar.me ou Mercado Pago e troque
// a constante GATEWAY abaixo; nenhuma tela precisa mudar.

export interface ResultadoCobranca {
  aprovado: boolean;
  referencia: string;
  mensagem?: string;
}

export interface Gateway {
  nome: string;
  cobrar(params: { valorCentavos: number; descricao: string; metodo: MetodoPagamento }): ResultadoCobranca;
}

const gatewaySimulado: Gateway = {
  nome: "simulado",
  cobrar: ({ metodo }) =>
    /final 0000$/.test(metodo.descricao)
      ? { aprovado: false, referencia: `sim_${crypto.randomBytes(6).toString("hex")}`, mensagem: "Cartão recusado pela operadora." }
      : { aprovado: true, referencia: `sim_${crypto.randomBytes(6).toString("hex")}` },
};

const GATEWAY: Gateway = gatewaySimulado;

export const gatewayEhSimulado = () => GATEWAY.nome === "simulado";

/**
 * Cartão desligado (out/2026): por enquanto a contratação é só por Pix (QR Code, com
 * confirmação manual do admin). Toda cobrança vai para o Pix, mesmo de quem tem cartão
 * cadastrado, e as telas não oferecem cartão. Para voltar a aceitar cartão: implementar
 * um gateway real (Asaas, Pagar.me) e trocar para true.
 */
export const CARTAO_ATIVO = false;

/** A cobrança deste cliente vai para o Pix? */
export const pagaPorPix = (usuarioId: number) => !CARTAO_ATIVO || metodoPadrao(usuarioId)?.tipo === "pix";

export interface MetodoPagamento {
  id: number;
  tipo: "cartao" | "pix";
  descricao: string;
  padrao: number;
}

export interface Fatura {
  id: number;
  descricao: string;
  valor_centavos: number;
  status: "paga" | "pendente" | "falhou" | "cancelada";
  metodo: string;
  criado_em: string;
}

export const listarMetodos = (usuarioId: number) =>
  varios<MetodoPagamento>(
    "SELECT id, tipo, descricao, padrao FROM metodos_pagamento WHERE usuario_id = ? ORDER BY padrao DESC, id",
    usuarioId,
  );

export const metodoPadrao = (usuarioId: number) => listarMetodos(usuarioId)[0];

export function adicionarMetodo(usuarioId: number, tipo: "cartao" | "pix", final?: string): number {
  const descricao =
    tipo === "pix" ? "Pix" : `Cartão de crédito final ${(final ?? "").replace(/\D/g, "").slice(-4).padStart(4, "0")}`;
  const temPadrao = listarMetodos(usuarioId).length > 0;
  return executar(
    "INSERT INTO metodos_pagamento (usuario_id, tipo, descricao, padrao) VALUES (?, ?, ?, ?)",
    usuarioId,
    tipo,
    descricao,
    temPadrao ? 0 : 1,
  ).id;
}

export function definirPadrao(usuarioId: number, metodoId: number) {
  const m = um("SELECT id FROM metodos_pagamento WHERE id = ? AND usuario_id = ?", metodoId, usuarioId);
  if (!m) throw new ErroNegocio("Forma de pagamento não encontrada.", 404);
  executar("UPDATE metodos_pagamento SET padrao = (id = ?) WHERE usuario_id = ?", metodoId, usuarioId);
}

export function removerMetodo(usuarioId: number, metodoId: number) {
  const metodos = listarMetodos(usuarioId);
  if (metodos.length <= 1) throw new ErroNegocio("Mantenha pelo menos uma forma de pagamento.");
  executar("DELETE FROM metodos_pagamento WHERE id = ? AND usuario_id = ?", metodoId, usuarioId);
  if (!listarMetodos(usuarioId).some((m) => m.padrao)) definirPadrao(usuarioId, listarMetodos(usuarioId)[0].id);
}

export const listarFaturas = (usuarioId: number) =>
  varios<Fatura>(
    "SELECT id, descricao, valor_centavos, status, metodo, criado_em FROM faturas WHERE usuario_id = ? ORDER BY id DESC",
    usuarioId,
  );

/**
 * Tenta cobrar e registra a fatura (paga ou recusada). Não lança erro na recusa:
 * quem chama decide o que fazer (ex.: a renovação entra em carência).
 */
export function tentarCobrar(
  usuarioId: number,
  valorReais: number,
  descricao: string,
  metodoId?: number,
): { aprovado: true; faturaId: number } | { aprovado: false; mensagem: string } {
  const metodo = metodoId
    ? listarMetodos(usuarioId).find((m) => m.id === metodoId)
    : metodoPadrao(usuarioId);
  if (!metodo) return { aprovado: false, mensagem: "Cadastre uma forma de pagamento antes." };
  const valorCentavos = Math.round(valorReais * 100);
  const r = GATEWAY.cobrar({ valorCentavos, descricao, metodo });
  const faturaId = executar(
    "INSERT INTO faturas (usuario_id, descricao, valor_centavos, status, metodo, referencia_gateway) VALUES (?, ?, ?, ?, ?, ?)",
    usuarioId,
    descricao,
    valorCentavos,
    r.aprovado ? "paga" : "falhou",
    metodo.descricao,
    r.referencia,
  ).id;
  return r.aprovado
    ? { aprovado: true, faturaId }
    : { aprovado: false, mensagem: r.mensagem ?? "O pagamento foi recusado. Tente outra forma de pagamento." };
}

/** Cobra e registra a fatura. Lança erro se a cobrança for recusada. */
export function cobrar(usuarioId: number, valorReais: number, descricao: string, metodoId?: number): number {
  const r = tentarCobrar(usuarioId, valorReais, descricao, metodoId);
  if (!r.aprovado) throw new ErroNegocio(r.mensagem, 402);
  return r.faturaId;
}
