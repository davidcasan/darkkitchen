import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ErroNegocio, PASTA_ARQUIVOS, executar, transacao, um, varios } from "../db";
import type { Usuario } from "../auth";
import { IMPORTANTE, notificar, notificarPapel } from "./notificacoes";

// Atendimento (SAC): chat entre o cliente e o admin, dentro da plataforma.
// - Uma conversa por pedido e uma conversa geral por cliente (dúvidas que não são
//   de um pedido, como créditos adicionais).
// - Ninguém edita mensagens (o banco recusa). Só o admin apaga uma mensagem ou a
//   conversa inteira; cada exclusão fica registrada em atendimento_exclusoes.
// - Mensagens podem levar uma imagem PNG, JPG ou BMP de até 2 MB.
// - Do lado da equipe, só o admin participa.

export const LIMITE_TEXTO = 4000;
export const LIMITE_IMAGEM_MB = 2;

/** Formatos aceitos, conferidos pelos primeiros bytes do arquivo (não só pela extensão). */
const FORMATOS: { mime: string; ext: string; assinatura: number[] }[] = [
  { mime: "image/png", ext: ".png", assinatura: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", ext: ".jpg", assinatura: [0xff, 0xd8, 0xff] },
  { mime: "image/bmp", ext: ".bmp", assinatura: [0x42, 0x4d] },
];

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
  imagem_nome: string | null; // há imagem quando preenchido (baixada por /api/v1/atendimento/imagem/[id])
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
    `SELECT m.id, m.texto, m.criado_em, u.nome autor_nome, (u.papel != 'cliente') da_equipe, m.imagem_nome
     FROM atendimento_mensagens m JOIN usuarios u ON u.id = m.autor_id
     WHERE m.cliente_id = ? AND m.pedido_id IS ? AND m.id > ? ORDER BY m.id`,
    c.clienteId,
    c.pedidoId,
    depoisDe,
  );
  if (mensagens.length) marcarLida(usuario.id, c, mensagens[mensagens.length - 1].id);
  return mensagens;
}

/** Ids de todas as mensagens da conversa (a tela tira as que o admin apagou). */
export const idsDaConversa = (c: Conversa) =>
  varios<{ id: number }>(`SELECT id FROM atendimento_mensagens WHERE ${filtro} ORDER BY id`, c.clienteId, c.pedidoId).map(
    (r) => r.id,
  );

/** Confere e grava a imagem anexada. Devolve os dados para a mensagem. */
async function guardarImagem(arquivo: File) {
  if (arquivo.size === 0) throw new ErroNegocio("A imagem está vazia.");
  if (arquivo.size > LIMITE_IMAGEM_MB * 1024 * 1024)
    throw new ErroNegocio(`A imagem passa do limite de ${LIMITE_IMAGEM_MB} MB.`);
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  const formato = FORMATOS.find((f) => f.assinatura.every((b, i) => bytes[i] === b));
  if (!formato) throw new ErroNegocio("Envie uma imagem PNG, JPG ou BMP.");
  const relativo = path.join("atendimento", new Date().toISOString().slice(0, 7), `${crypto.randomUUID()}${formato.ext}`);
  const destino = path.join(PASTA_ARQUIVOS, relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, bytes);
  return {
    caminho: relativo,
    nome: path.basename(arquivo.name).slice(0, 180) || `imagem${formato.ext}`,
    mime: formato.mime,
    tamanho: arquivo.size,
  };
}

/** Envia uma mensagem (texto, imagem ou os dois) e avisa o outro lado (no máximo um aviso a cada 15 minutos por conversa). */
export async function enviarMensagem(
  usuario: Usuario,
  c: Conversa & { titulo: string; cliente_nome: string },
  texto: string,
  imagem?: File | null,
) {
  const t = texto.trim();
  if (!t && !imagem) throw new ErroNegocio("Escreva a mensagem ou anexe uma imagem.");
  if (t.length > LIMITE_TEXTO) throw new ErroNegocio(`A mensagem passou de ${LIMITE_TEXTO} caracteres.`);
  const img = imagem ? await guardarImagem(imagem) : null;
  return transacao(() => {
    const anterior = um<{ autor_id: number; recente: number }>(
      `SELECT autor_id, (criado_em > datetime('now', '-15 minutes')) recente FROM atendimento_mensagens
       WHERE ${filtro} ORDER BY id DESC LIMIT 1`,
      c.clienteId,
      c.pedidoId,
    );
    const id = executar(
      `INSERT INTO atendimento_mensagens (cliente_id, pedido_id, autor_id, texto, imagem_caminho, imagem_nome, imagem_mime, imagem_tamanho)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      c.clienteId,
      c.pedidoId,
      usuario.id,
      t,
      img?.caminho ?? null,
      img?.nome ?? null,
      img?.mime ?? null,
      img?.tamanho ?? null,
    ).id;
    marcarLida(usuario.id, c, id);
    // Sequência de mensagens do mesmo lado em poucos minutos gera um aviso só.
    const doCliente = usuario.papel === "cliente";
    const mesmoLado = anterior && anterior.recente && (anterior.autor_id === c.clienteId) === doCliente;
    if (!mesmoLado) {
      const sufixo = c.pedidoId ? `pedido=${c.pedidoId}` : `cliente=${c.clienteId}`;
      if (doCliente)
        notificarPapel(["admin"], `Nova mensagem de ${c.cliente_nome} no atendimento (${c.titulo}).`, `/equipe/atendimento?${sufixo}`, IMPORTANTE);
      else
        notificar(
          c.clienteId,
          `O atendimento respondeu: ${c.titulo}.`,
          c.pedidoId ? `/cliente/pedidos/${c.pedidoId}?chat=1` : "/cliente?chat=1",
          IMPORTANTE,
        );
    }
    return id;
  });
}

/** Imagem de uma mensagem, conferindo o acesso: o cliente da conversa ou um admin. */
export function imagemDaMensagem(usuario: Usuario, mensagemId: number) {
  const m = um<{ cliente_id: number; imagem_caminho: string | null; imagem_nome: string; imagem_mime: string; imagem_tamanho: number }>(
    "SELECT cliente_id, imagem_caminho, imagem_nome, imagem_mime, imagem_tamanho FROM atendimento_mensagens WHERE id = ?",
    mensagemId,
  );
  const pode = usuario.papel === "admin" || (usuario.papel === "cliente" && m?.cliente_id === usuario.id);
  if (!m?.imagem_caminho || !pode) throw new ErroNegocio("Imagem não encontrada.", 404);
  return { caminho: path.join(PASTA_ARQUIVOS, m.imagem_caminho), nome: m.imagem_nome, mime: m.imagem_mime, tamanho: m.imagem_tamanho };
}

function apagarImagens(caminhos: (string | null)[]) {
  for (const c of caminhos) if (c) fs.rmSync(path.join(PASTA_ARQUIVOS, c), { force: true });
}

const exigirAdmin = (u: Usuario) => {
  if (u.papel !== "admin") throw new ErroNegocio("Só o admin pode apagar mensagens.", 403);
};

/** Admin apaga uma mensagem (e a imagem dela). Fica registrado. */
export function apagarMensagem(admin: Usuario, mensagemId: number) {
  exigirAdmin(admin);
  const m = um<{ cliente_id: number; pedido_id: number | null; imagem_caminho: string | null }>(
    "SELECT cliente_id, pedido_id, imagem_caminho FROM atendimento_mensagens WHERE id = ?",
    mensagemId,
  );
  if (!m) throw new ErroNegocio("Mensagem não encontrada.", 404);
  transacao(() => {
    executar("DELETE FROM atendimento_mensagens WHERE id = ?", mensagemId);
    executar(
      "INSERT INTO atendimento_exclusoes (admin_id, cliente_id, pedido_id, quantidade) VALUES (?, ?, ?, 1)",
      admin.id,
      m.cliente_id,
      m.pedido_id,
    );
  });
  apagarImagens([m.imagem_caminho]);
}

/** Admin apaga a conversa inteira (mensagens, imagens e leituras). Fica registrado. */
export function apagarConversa(admin: Usuario, c: Conversa) {
  exigirAdmin(admin);
  const imagens = varios<{ imagem_caminho: string | null }>(
    `SELECT imagem_caminho FROM atendimento_mensagens WHERE ${filtro}`,
    c.clienteId,
    c.pedidoId,
  );
  if (!imagens.length) throw new ErroNegocio("Esta conversa já está vazia.");
  transacao(() => {
    executar(`DELETE FROM atendimento_mensagens WHERE ${filtro}`, c.clienteId, c.pedidoId);
    executar("DELETE FROM atendimento_leituras WHERE cliente_id = ? AND pedido_chave = ?", c.clienteId, chave(c));
    executar(
      "INSERT INTO atendimento_exclusoes (admin_id, cliente_id, pedido_id, quantidade, conversa_inteira) VALUES (?, ?, ?, ?, 1)",
      admin.id,
      c.clienteId,
      c.pedidoId,
      imagens.length,
    );
  });
  apagarImagens(imagens.map((i) => i.imagem_caminho));
  return imagens.length;
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
            CASE WHEN ult.texto = '' THEN 'Imagem' ELSE ult.texto END ultima_texto, ult.criado_em ultima_em, (ua.papel != 'cliente') ultima_da_equipe,
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
