import { comUsuario, falha, ok } from "@/server/api";
import {
  abrirConversa,
  apagarConversa,
  apagarMensagem,
  enviarMensagem,
  idsDaConversa,
  lidaPeloOutroLado,
  listarMensagens,
  naoLidasNaConversa,
} from "@/server/services/atendimento";

// Chat do atendimento (SAC). Conversa de um pedido: ?pedido=ID. Conversa geral:
// sem pedido (cliente) ou ?cliente=ID (admin).
// GET    → mensagens (a partir de ?depois=ID) e marca como lidas; "lidaAte" diz até qual
//          mensagem o outro lado já leu (tiques de lida) e "ids" lista as mensagens que
//          ainda existem (o admin pode apagar). Com ?contar=1 só devolve quantas não foram
//          lidas, sem marcar.
// POST   → JSON { texto, pedido?, cliente? } ou multipart (texto, pedido, cliente, imagem)
//          para enviar com imagem PNG/JPG/BMP de até 2 MB. Ninguém edita mensagens.
// DELETE → só admin: ?mensagem=ID apaga uma mensagem; ?pedido/?cliente com ?conversa=1
//          apaga a conversa inteira.

const numero = (v: unknown) => (v == null || v === "" ? null : Number(v) || null);

export const GET = comUsuario((req, usuario) => {
  const q = new URL(req.url).searchParams;
  const conversa = abrirConversa(usuario, { pedidoId: numero(q.get("pedido")), clienteId: numero(q.get("cliente")) });
  if (q.get("contar")) return ok({ naoLidas: naoLidasNaConversa(usuario, conversa) });
  return ok({
    titulo: conversa.titulo,
    mensagens: listarMensagens(usuario, conversa, numero(q.get("depois")) ?? 0),
    lidaAte: lidaPeloOutroLado(usuario, conversa),
    ids: idsDaConversa(conversa),
  });
});

export const POST = comUsuario(async (req, usuario) => {
  let texto: unknown, pedido: unknown, cliente: unknown, imagem: File | null = null;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return falha("Envio inválido.");
    texto = form.get("texto") ?? "";
    pedido = form.get("pedido");
    cliente = form.get("cliente");
    const arquivo = form.get("imagem");
    if (arquivo instanceof File && arquivo.size > 0) imagem = arquivo;
  } else {
    const corpo = (await req.json().catch(() => null)) as { texto?: unknown; pedido?: unknown; cliente?: unknown } | null;
    if (!corpo) return falha("Envio inválido.");
    ({ texto, pedido, cliente } = corpo);
  }
  if (typeof texto !== "string") return falha("Envie o texto da mensagem.");
  const conversa = abrirConversa(usuario, { pedidoId: numero(pedido), clienteId: numero(cliente) });
  return ok({ id: await enviarMensagem(usuario, conversa, texto, imagem) }, 201);
});

export const DELETE = comUsuario((req, usuario) => {
  const q = new URL(req.url).searchParams;
  const mensagem = numero(q.get("mensagem"));
  if (mensagem) {
    apagarMensagem(usuario, mensagem);
    return ok({ apagadas: 1 });
  }
  if (!q.get("conversa")) return falha("Informe a mensagem ou a conversa a apagar.");
  const conversa = abrirConversa(usuario, { pedidoId: numero(q.get("pedido")), clienteId: numero(q.get("cliente")) });
  return ok({ apagadas: apagarConversa(usuario, conversa) });
});
