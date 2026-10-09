import { ehEquipe } from "@/domain/pedido";
import { comUsuario, falha, ok } from "@/server/api";
import { criarPedido, listarPedidosCliente, listarPedidosEquipe } from "@/server/services/pedidos";

export const GET = comUsuario((_req, usuario) =>
  ok(ehEquipe(usuario.papel) ? listarPedidosEquipe() : listarPedidosCliente(usuario.id)),
);

/** Cria um pedido a partir do briefing (JSON). Mesmas regras do formulário web. */
export const POST = comUsuario(async (req, usuario) => {
  const corpo = await req.json().catch(() => null);
  if (!corpo) return falha("Envie o briefing em JSON.");
  return ok(criarPedido(usuario, corpo), 201);
});
