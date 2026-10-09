import "server-only";
import { ErroNegocio, executar, transacao, um, varios } from "../db";
import type { Usuario } from "../auth";
import { notificar, notificarPapel } from "./notificacoes";

// Atendimento (SAC): chat entre o cliente e o admin, dentro da plataforma.
// - Uma conversa por pedido e uma conversa geral por cliente (dúvidas que não são
//   de um pedido, como créditos adicionais).
// - Mensagens são permanentes: não há edição nem exclusão (o banco também recusa).
// - Do lado da equipe, só o admin participa.

export const LIMITE_TEXTO = 4000;

export interface Conversa {
  clienteId: number;
  pedidoId: number | null;
}

export interface MensagemAtendimento {
  id: number;
  texto: string;
  criado_em: string;
  autor_nome: string;
  da_equipe: number; // 1 = mensagem do atendimento (admin)
}

const chave = (c: Conversa) => c.pedidoId ?? 0;
const filtro = "cliente_id = ? AND pedido_id IS ?";

/**
 * Resolve e confere a conversa pedida. Cliente: só as próprias. Admin: qualquer uma.
 * Para pedido, o cliente sai do próprio pedido; para a conversa geral, o admin informa o cliente.
 */
export function abrirConversa(usuario: Usuario, alvo: { pedidoId?: number | null; clienteId?: number | null }): Conversa & {
  titulo: string;
  cliente_nome: string;
} {
  if (usuario.papel !== "cliente" && usuario.papel !== "admin")
    throw new ErroNegocio("O atendimento é feito pelo admin.", 403);
  if (alvo.pedidoId) {
    const p = um<{ cliente_id: number; codigo: string; titulo: string; cliente_nome: string }>(
      "SELECT p.cliente_id, p.codigo, p.titulo, u.nome cliente_nome FROM pedidos p JOIN usuarios u ON u.id = p.cliente_id WHERE p.id = ?",
      alvo.pedidoId,
    );
    if (!p || (usuario.papel === "cliente" && p.cliente_id !== usuario.id)) throw new ErroNegocio("Pedido não encontrado.", 404);
    return { clienteId: p.cliente_id, pedidoId: alvo.pedidoId, titulo: `${p.codigo} · ${p.titulo}`, cliente_nome: p.cliente_nome };
  }
  const clienteId = usuario.papel === "cliente" ? usuario.id : alvo.clienteId;
  const c = clienteId
    ? um<{ nome: string }>("SELECT nome FROM usuarios WHERE id = ? AND papel = 'cliente'", clienteId)
    : undefined;
  if (!clienteId || !c) throw new ErroNegocio("Cliente não encontrado.", 404);
  return { clienteId, pedidoId: null, titulo: "Atendimento geral", cliente_nome: c.nome };
}

function ultimaLida(usuarioId: number, c: Conversa) {
  return (
    um<{ ultima_lida: number }>(
      "SELECT ultima_lida FROM atendimento_leituras WHERE usuario_id = ? AND cliente_id = ? AND pedido_chave = ?",
      usuarioId,
      c.clienteId,
      chave(c),
    )?.ultima_lida ?? 0
  );
}

function marcarLida(usuarioId: number, c: Conversa, ate: number) {
  executar(
    `INSERT INTO atendimento_leituras (usuario_id, cliente_id, pedido_chave, ultima_lida) VALUES (?, ?, ?, ?)
     ON CONFLICT (usuario_id, cliente_id, pedido_chave) DO UPDATE SET ultima_lida = MAX(ultima_lida, excluded.ultima_lida)`,
    usuarioId,
    c.clienteId,
    chave(c),
    ate,
  );
}

/** Quantas mensagens do outro lado a pessoa ainda não leu nesta conversa. */
export function naoLidasNaConversa(usuario: Usuario, c: Conversa) {
  return (
    um<{ n: number }>(
      `SELECT COUNT(*) n FROM atendimento_mensagens WHERE ${filtro} AND id > ? AND autor_id != ?`,
      c.clienteId,
      c.pedidoId,
      ultimaLida(usuario.id, c),
      usuario.id,
    )?.n ?? 0
  );
}

/**
 * Até qual mensagem o outro lado já leu (para os dois tiques de "lida").
 * Mensagem do cliente: lida quando qualquer admin a leu. Mensagem do admin: lida quando o cliente leu.
 */
export function lidaPeloOutroLado(usuario: Usuario, c: Conversa) {
  const r =
    usuario.papel === "cliente"
      ? um<{ m: number | null }>(
          `SELECT MAX(l.ultima_lida) m FROM atendimento_leituras l JOIN usuarios u ON u.id = l.usuario_id
           WHERE u.papel = 'admin' AND l.cliente_id = ? AND l.pedido_chave = ?`,
          c.clienteId,
          chave(c),
        )
      : um<{ m: number | null }>(
          "SELECT ultima_lida m FROM atendimento_leituras WHERE usuario_id = ? AND cliente_id = ? AND pedido_chave = ?",
          c.clienteId,
          c.clienteId,
          chave(c),
        );
  return r?.m ?? 0;
}

/** Mensagens da conversa (a partir de um id, para atualizar sem recarregar tudo). Marca como lidas. */
export function listarMensagens(usuario: Usuario, c: Conversa, depoisDe = 0) {
  const mensagens = varios<MensagemAtendimento>(
    `SELECT m.id, m.texto, m.criado_em, u.nome autor_nome, (u.papel != 'cliente') da_equipe
     FROM atendimento_mensagens m JOIN usuarios u ON u.id = m.autor_id
     WHERE m.cliente_id = ? AND m.pedido_id IS ? AND m.id > ? ORDER BY m.id`,
    c.clienteId,
    c.pedidoId,
    depoisDe,
  );
  if (mensagens.length) marcarLida(usuario.id, c, mensagens[mensagens.length - 1].id);
  return mensagens;
}

/** Envia uma mensagem e avisa o outro lado (no máximo um aviso a cada 15 minutos por conversa). */
export function enviarMensagem(usuario: Usuario, c: Conversa & { titulo: string; cliente_nome: string }, texto: string) {
  const t = texto.trim();
  if (!t) throw new ErroNegocio("Escreva a mensagem.");
  if (t.length > LIMITE_TEXTO) throw new ErroNegocio(`A mensagem passou de ${LIMITE_TEXTO} caracteres.`);
  return transacao(() => {
    const anterior = um<{ autor_id: number; recente: number }>(
      `SELECT autor_id, (criado_em > datetime('now', '-15 minutes')) recente FROM atendimento_mensagens
       WHERE ${filtro} ORDER BY id DESC LIMIT 1`,
      c.clienteId,
      c.pedidoId,
    );
    const id = executar(
      "INSERT INTO atendimento_mensagens (cliente_id, pedido_id, autor_id, texto) VALUES (?, ?, ?, ?)",
      c.clienteId,
      c.pedidoId,
      usuario.id,
      t,
    ).id;
    marcarLida(usuario.id, c, id);
    // Sequência de mensagens do mesmo lado em poucos minutos gera um aviso só.
    const doCliente = usuario.papel === "cliente";
    const mesmoLado = anterior && anterior.recente && (anterior.autor_id === c.clienteId) === doCliente;
    if (!mesmoLado) {
      const sufixo = c.pedidoId ? `pedido=${c.pedidoId}` : `cliente=${c.clienteId}`;
      if (doCliente)
        notificarPapel(["admin"], `Nova mensagem de ${c.cliente_nome} no atendimento (${c.titulo}).`, `/equipe/atendimento?${sufixo}`);
      else
        notificar(
          c.clienteId,
          `O atendimento respondeu: ${c.titulo}.`,
          c.pedidoId ? `/cliente/pedidos/${c.pedidoId}?chat=1` : "/cliente?chat=1",
        );
    }
    return id;
  });
}

export interface ResumoConversa {
  cliente_id: number;
  pedido_id: number | null;
  cliente_nome: string;
  empresa: string | null;
  pedido_codigo: string | null;
  pedido_titulo: string | null;
  ultima_texto: string;
  ultima_em: string;
  ultima_da_equipe: number;
  total: number;
  nao_lidas: number;
}

/** Todas as conversas, as mais recentes primeiro, com quantas o admin ainda não leu. */
export function listarConversas(admin: Usuario) {
  return varios<ResumoConversa>(
    `SELECT m.cliente_id, m.pedido_id, u.nome cliente_nome, u.empresa, p.codigo pedido_codigo, p.titulo pedido_titulo,
            ult.texto ultima_texto, ult.criado_em ultima_em, (ua.papel != 'cliente') ultima_da_equipe,
            COUNT(*) total,
            SUM(CASE WHEN m.id > COALESCE(l.ultima_lida, 0) AND m.autor_id != ?1 THEN 1 ELSE 0 END) nao_lidas
     FROM atendimento_mensagens m
     JOIN usuarios u ON u.id = m.cliente_id
     LEFT JOIN pedidos p ON p.id = m.pedido_id
     LEFT JOIN atendimento_leituras l
       ON l.usuario_id = ?1 AND l.cliente_id = m.cliente_id AND l.pedido_chave = COALESCE(m.pedido_id, 0)
     JOIN atendimento_mensagens ult ON ult.id = (
       SELECT MAX(id) FROM atendimento_mensagens x WHERE x.cliente_id = m.cliente_id AND x.pedido_id IS m.pedido_id)
     JOIN usuarios ua ON ua.id = ult.autor_id
     GROUP BY m.cliente_id, m.pedido_id
     ORDER BY ult.id DESC`,
    admin.id,
  );
}

/** Total de mensagens não lidas no atendimento (para o selo no menu). */
export function naoLidasAtendimento(usuario: Usuario) {
  const sql = `SELECT COUNT(*) n FROM atendimento_mensagens m
     LEFT JOIN atendimento_leituras l
       ON l.usuario_id = ? AND l.cliente_id = m.cliente_id AND l.pedido_chave = COALESCE(m.pedido_id, 0)
     WHERE m.autor_id != ? AND m.id > COALESCE(l.ultima_lida, 0)`;
  if (usuario.papel === "admin") return um<{ n: number }>(sql, usuario.id, usuario.id)?.n ?? 0;
  if (usuario.papel === "cliente") return um<{ n: number }>(`${sql} AND m.cliente_id = ?`, usuario.id, usuario.id, usuario.id)?.n ?? 0;
  return 0;
}
