import "server-only";
import { executar, um, varios } from "../db";

export type TipoLancamento = "assinatura" | "compra" | "pedido" | "revisao_extra" | "estorno" | "ajuste" | "expiracao";

export interface Lancamento {
  id: number;
  quantidade: number;
  tipo: TipoLancamento;
  descricao: string;
  pedido_id: number | null;
  pedido_codigo: string | null;
  criado_em: string;
}

export const saldo = (usuarioId: number) =>
  um<{ s: number }>("SELECT COALESCE(SUM(quantidade), 0) s FROM creditos WHERE usuario_id = ?", usuarioId)?.s ?? 0;

export const extrato = (usuarioId: number, limite = 100) =>
  varios<Lancamento>(
    `SELECT c.id, c.quantidade, c.tipo, c.descricao, c.pedido_id, p.codigo pedido_codigo, c.criado_em
     FROM creditos c LEFT JOIN pedidos p ON p.id = c.pedido_id
     WHERE c.usuario_id = ? ORDER BY c.id DESC LIMIT ?`,
    usuarioId,
    limite,
  );

/** Registra uma entrada (positiva) ou saída (negativa). Deve rodar dentro de uma transação quando acompanha outra escrita. */
export function lancar(
  usuarioId: number,
  quantidade: number,
  tipo: TipoLancamento,
  descricao: string,
  ref: { pedidoId?: number; faturaId?: number } = {},
) {
  return executar(
    "INSERT INTO creditos (usuario_id, quantidade, tipo, descricao, pedido_id, fatura_id) VALUES (?, ?, ?, ?, ?, ?)",
    usuarioId,
    quantidade,
    tipo,
    descricao,
    ref.pedidoId ?? null,
    ref.faturaId ?? null,
  ).id;
}
