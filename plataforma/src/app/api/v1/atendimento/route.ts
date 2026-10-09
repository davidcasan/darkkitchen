import { comUsuario, falha, ok } from "@/server/api";
import {
  abrirConversa,
  enviarMensagem,
  lidaPeloOutroLado,
  listarMensagens,
  naoLidasNaConversa,
} from "@/server/services/atendimento";

// Chat do atendimento (SAC). Conversa de um pedido: ?pedido=ID. Conversa geral:
// sem pedido (cliente) ou ?cliente=ID (admin).
// GET  → mensagens (a partir de ?depois=ID) e marca como lidas; "lidaAte" diz até qual
//        mensagem o outro lado já leu (tiques de lida). Com ?contar=1 só
//        devolve quantas não foram lidas, sem marcar.
// POST → { texto, pedido?, cliente? } envia uma mensagem. Não há edição nem exclusão.

const numero = (v: unknown) => (v == null || v === "" ? null : Number(v) || null);

export const GET = comUsuario((req, usuario) => {
  const q = new URL(req.url).searchParams;
  const conversa = abrirConversa(usuario, { pedidoId: numero(q.get("pedido")), clienteId: numero(q.get("cliente")) });
  if (q.get("contar")) return ok({ naoLidas: naoLidasNaConversa(usuario, conversa) });
  return ok({
    titulo: conversa.titulo,
    mensagens: listarMensagens(usuario, conversa, numero(q.get("depois")) ?? 0),
    lidaAte: lidaPeloOutroLado(usuario, conversa),
  });
});

export const POST = comUsuario(async (req, usuario) => {
  const corpo = (await req.json().catch(() => null)) as { texto?: unknown; pedido?: unknown; cliente?: unknown } | null;
  if (!corpo || typeof corpo.texto !== "string") return falha("Envie o texto da mensagem.");
  const conversa = abrirConversa(usuario, { pedidoId: numero(corpo.pedido), clienteId: numero(corpo.cliente) });
  return ok({ id: enviarMensagem(usuario, conversa, corpo.texto) }, 201);
});
