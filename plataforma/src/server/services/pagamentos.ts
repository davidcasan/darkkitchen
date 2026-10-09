import "server-only";
import crypto from "node:crypto";
import { ErroNegocio, executar, um, varios } from "../db";

// Pagamentos. Toda cobrança passa por um "gateway". Hoje o gateway é
// simulado (aprova na hora, sem dinheiro real). Para cobrar de verdade,
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
  cobrar: () => ({ aprovado: true, referencia: `sim_${crypto.randomBytes(6).toString("hex")}` }),
};

const GATEWAY: Gateway = gatewaySimulado;

export const gatewayEhSimulado = () => GATEWAY.nome === "simulado";

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
  status: "paga" | "pendente" | "falhou";
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

/** Cobra e registra a fatura. Lança erro se a cobrança for recusada. */
export function cobrar(usuarioId: number, valorReais: number, descricao: string, metodoId?: number): number {
  const metodo = metodoId
    ? listarMetodos(usuarioId).find((m) => m.id === metodoId)
    : metodoPadrao(usuarioId);
  if (!metodo) throw new ErroNegocio("Cadastre uma forma de pagamento antes.");
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
  if (!r.aprovado) throw new ErroNegocio(r.mensagem ?? "O pagamento foi recusado. Tente outra forma de pagamento.", 402);
  return faturaId;
}
