import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NOME_ATENDIMENTO } from "@/domain/contato";
import { ErroNegocio, PASTA_ARQUIVOS, executar, um, varios } from "../db";
import type { Usuario } from "../auth";
import { abrirConversa, enviarMensagem } from "./atendimento";
import { usuarioPorId } from "./usuarios";

// Atendimento pelo Telegram (out/2026). O cliente continua só no chat da plataforma;
// o admin recebe cada mensagem no bot (TELEGRAM_BOT_TOKEN, .env.local) e responde
// arrastando a mensagem para o lado (reply). A resposta entra na conversa certa
// como mensagem do atendimento. Só contas de admin ligadas pelo link de uso único
// (tela Conta) são aceitas. O servidor busca as respostas no Telegram (long polling),
// sem precisar de endereço público. Um token só pode ter UM programa ouvindo:
// nunca deixar o mesmo token no desenvolvimento e no servidor ao mesmo tempo.

const token = () => process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
export const telegramAtivo = () => Boolean(token());

interface Mensagem {
  message_id: number;
  chat: { id: number; type: string; first_name?: string; username?: string };
  text?: string;
  caption?: string;
  photo?: { file_id: string; file_size?: number }[];
  document?: { file_id: string; mime_type?: string; file_name?: string; file_size?: number };
  reply_to_message?: { message_id: number };
}

async function api<T>(metodo: string, corpo: Record<string, unknown> | FormData = {}): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${token()}/${metodo}`, {
    method: "POST",
    ...(corpo instanceof FormData
      ? { body: corpo }
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  // A mensagem de erro nunca leva o endereço (que contém o token).
  if (!j.ok) throw new Error(`Telegram ${metodo}: ${j.description ?? r.status}`);
  return j.result as T;
}

const html = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const enviarTexto = (chatId: string, texto: string) =>
  api<Mensagem>("sendMessage", { chat_id: chatId, text: texto, parse_mode: "HTML", link_preview_options: { is_disabled: true } });

// ---------- Ligar a conta do admin ----------

let usuarioBot: string | null = null;

/** @usuário do bot (para o link t.me). Vem do TELEGRAM_BOT_USUARIO ou do próprio Telegram. */
export async function usuarioDoBot() {
  if (usuarioBot) return usuarioBot;
  usuarioBot = process.env.TELEGRAM_BOT_USUARIO?.replace(/^@/, "").trim() || (await api<{ username: string }>("getMe")).username;
  return usuarioBot;
}

const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/** Link de uso único (15 minutos) que liga o Telegram de quem abrir à conta deste admin. */
export async function linkParaLigar(admin: Usuario) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador recebe o atendimento no Telegram.", 403);
  if (!telegramAtivo()) throw new ErroNegocio("O bot do Telegram não está configurado neste servidor.");
  const codigo = crypto.randomBytes(18).toString("base64url");
  executar("DELETE FROM telegram_codigos WHERE usuario_id = ? OR expira_em < datetime('now')", admin.id);
  executar("INSERT INTO telegram_codigos (hash, usuario_id, expira_em) VALUES (?, ?, datetime('now', '+15 minutes'))", hash(codigo), admin.id);
  return `https://t.me/${await usuarioDoBot()}?start=${codigo}`;
}

export const destinosDoUsuario = (usuarioId: number) =>
  varios<{ chat_id: string; nome: string | null; criado_em: string }>(
    "SELECT chat_id, nome, criado_em FROM telegram_destinos WHERE usuario_id = ? ORDER BY criado_em",
    usuarioId,
  );

export function desligarTelegram(usuario: Usuario) {
  executar("DELETE FROM telegram_destinos WHERE usuario_id = ?", usuario.id);
}

// ---------- Da plataforma para o Telegram ----------

interface MensagemCompleta {
  texto: string;
  imagem_caminho: string | null;
  imagem_mime: string | null;
  imagem_nome: string | null;
  autor_nome: string;
  autor_papel: string;
  cliente_id: number;
  pedido_id: number | null;
  cliente_nome: string;
  empresa: string | null;
  codigo: string | null;
  titulo: string | null;
}

/**
 * Manda uma mensagem do atendimento para os admins ligados ao Telegram. Do cliente:
 * para todos. De um admin: para os outros chats (assim o Telegram mostra a conversa
 * inteira), menos o chat de onde a resposta saiu.
 */
export async function encaminharMensagem(mensagemId: number, exceto?: string) {
  if (!telegramAtivo()) return;
  const m = um<MensagemCompleta>(
    `SELECT m.texto, m.imagem_caminho, m.imagem_mime, m.imagem_nome, a.nome autor_nome, a.papel autor_papel,
            m.cliente_id, m.pedido_id, c.nome cliente_nome, c.empresa, p.codigo, p.titulo
     FROM atendimento_mensagens m
     JOIN usuarios a ON a.id = m.autor_id
     JOIN usuarios c ON c.id = m.cliente_id
     LEFT JOIN pedidos p ON p.id = m.pedido_id
     WHERE m.id = ?`,
    mensagemId,
  );
  if (!m) return;
  const destinos = varios<{ chat_id: string }>(
    `SELECT d.chat_id FROM telegram_destinos d JOIN usuarios u ON u.id = d.usuario_id
     WHERE u.ativo = 1 AND u.papel = 'admin'`,
  ).filter((d) => d.chat_id !== exceto);
  if (!destinos.length) return;

  const doCliente = m.autor_papel === "cliente";
  const quem = `<b>${html(m.cliente_nome)}</b>${m.empresa ? ` · ${html(m.empresa)}` : ""}`;
  const cabeca = [
    doCliente ? `💬 ${quem}` : `↩️ ${html(m.autor_nome)} respondeu a ${quem}`,
    m.codigo ? `📦 ${html(m.codigo)} · ${html(m.titulo ?? "")}` : "🗂 Atendimento geral",
  ].join("\n");
  const corpo = html(m.texto);

  for (const d of destinos) {
    try {
      let enviada: Mensagem;
      if (m.imagem_caminho) {
        const fd = new FormData();
        fd.append("chat_id", d.chat_id);
        fd.append("parse_mode", "HTML");
        // Legenda de foto tem limite de 1024 caracteres.
        fd.append("caption", `${cabeca}${corpo ? `\n\n${corpo}` : ""}`.slice(0, 1000));
        const bytes = fs.readFileSync(path.join(PASTA_ARQUIVOS, m.imagem_caminho));
        const foto = m.imagem_mime === "image/png" || m.imagem_mime === "image/jpeg";
        fd.append(foto ? "photo" : "document", new Blob([bytes], { type: m.imagem_mime ?? "" }), m.imagem_nome ?? "imagem");
        enviada = await api<Mensagem>(foto ? "sendPhoto" : "sendDocument", fd);
      } else {
        enviada = await enviarTexto(d.chat_id, `${cabeca}\n\n${corpo}`.slice(0, 4000));
      }
      executar(
        "INSERT OR REPLACE INTO telegram_mensagens (chat_id, msg_id, cliente_id, pedido_id) VALUES (?, ?, ?, ?)",
        d.chat_id,
        enviada.message_id,
        m.cliente_id,
        m.pedido_id,
      );
    } catch (e) {
      console.error("[telegram] Falha ao encaminhar mensagem", mensagemId, (e as Error).message);
    }
  }
}

// ---------- Do Telegram para a plataforma ----------

const AJUDA = [
  `Você recebe aqui as mensagens dos clientes no atendimento da plataforma.`,
  ``,
  `<b>Para responder:</b> arraste a mensagem do cliente para a direita (ou toque nela e em "Responder") e escreva. Pode mandar foto também.`,
  `Para o cliente, a resposta aparece como "${NOME_ATENDIMENTO}".`,
  ``,
  `/sair para parar de receber aqui.`,
].join("\n");

async function baixarImagem(msg: Mensagem): Promise<File | null> {
  let fileId: string | null = null;
  let nome = "foto.jpg";
  let tipo = "image/jpeg";
  if (msg.photo?.length) fileId = msg.photo[msg.photo.length - 1].file_id; // maior resolução
  else if (msg.document && /^image\/(png|jpeg|bmp)$/.test(msg.document.mime_type ?? "")) {
    fileId = msg.document.file_id;
    nome = msg.document.file_name ?? "imagem";
    tipo = msg.document.mime_type!;
  }
  if (!fileId) return null;
  const f = await api<{ file_path: string }>("getFile", { file_id: fileId });
  const r = await fetch(`https://api.telegram.org/file/bot${token()}/${f.file_path}`);
  if (!r.ok) throw new ErroNegocio("Não consegui baixar a imagem do Telegram.");
  return new File([await r.arrayBuffer()], nome, { type: tipo });
}

async function ligar(chatId: string, codigo: string, msg: Mensagem) {
  const c = um<{ usuario_id: number }>(
    "SELECT usuario_id FROM telegram_codigos WHERE hash = ? AND expira_em > datetime('now')",
    hash(codigo),
  );
  if (!c) return enviarTexto(chatId, "Este link expirou ou já foi usado. Gere outro na tela Conta da plataforma.");
  const u = usuarioPorId(c.usuario_id);
  if (!u || u.papel !== "admin") return enviarTexto(chatId, "Esta conta não tem acesso ao atendimento.");
  executar("DELETE FROM telegram_codigos WHERE usuario_id = ?", u.id);
  const nome = msg.chat.username ? `@${msg.chat.username}` : (msg.chat.first_name ?? null);
  executar(
    `INSERT INTO telegram_destinos (chat_id, usuario_id, nome) VALUES (?, ?, ?)
     ON CONFLICT (chat_id) DO UPDATE SET usuario_id = excluded.usuario_id, nome = excluded.nome`,
    chatId,
    u.id,
    nome,
  );
  return enviarTexto(chatId, `✅ Pronto, ${html(u.nome)}! Este Telegram está ligado ao atendimento da plataforma.\n\n${AJUDA}`);
}

async function tratar(msg: Mensagem) {
  if (msg.chat.type !== "private") return;
  const chatId = String(msg.chat.id);
  const texto = (msg.text ?? msg.caption ?? "").trim();

  const inicio = texto.match(/^\/start(?:\s+([A-Za-z0-9_-]{10,64}))?$/);
  if (inicio?.[1]) return ligar(chatId, inicio[1], msg);

  const destino = um<{ usuario_id: number }>("SELECT usuario_id FROM telegram_destinos WHERE chat_id = ?", chatId);
  if (!destino) return enviarTexto(chatId, "Este bot é de uso interno da Dark Kitchen Studio.");
  const admin = usuarioPorId(destino.usuario_id);
  const ativo = um<{ ativo: number }>("SELECT ativo FROM usuarios WHERE id = ?", destino.usuario_id)?.ativo === 1;
  if (!admin || admin.papel !== "admin" || !ativo) {
    executar("DELETE FROM telegram_destinos WHERE chat_id = ?", chatId);
    return enviarTexto(chatId, "Sua conta não tem mais acesso ao atendimento. O Telegram foi desligado.");
  }
  if (texto === "/sair") {
    executar("DELETE FROM telegram_destinos WHERE chat_id = ?", chatId);
    return enviarTexto(chatId, "Desligado. Você não recebe mais o atendimento aqui. Para voltar, gere um link na tela Conta.");
  }
  if (/^\/(start|ajuda|help)$/.test(texto)) return enviarTexto(chatId, AJUDA);

  if (!msg.reply_to_message)
    return enviarTexto(chatId, "Para responder a um cliente, arraste a mensagem dele para a direita e escreva a resposta.");
  const alvo = um<{ cliente_id: number; pedido_id: number | null }>(
    "SELECT cliente_id, pedido_id FROM telegram_mensagens WHERE chat_id = ? AND msg_id = ?",
    chatId,
    msg.reply_to_message.message_id,
  );
  if (!alvo) return enviarTexto(chatId, "Não sei a qual conversa essa mensagem pertence. Responda a uma mensagem de cliente.");

  try {
    const imagem = await baixarImagem(msg);
    const conversa = abrirConversa(admin, alvo.pedido_id ? { pedidoId: alvo.pedido_id } : { clienteId: alvo.cliente_id });
    await enviarMensagem(admin, conversa, texto, imagem, chatId);
    // Confirma com um 👍 na própria mensagem (sem poluir a conversa); se não der, com texto.
    await api("setMessageReaction", {
      chat_id: chatId,
      message_id: msg.message_id,
      reaction: [{ type: "emoji", emoji: "👍" }],
    }).catch(() => enviarTexto(chatId, "✓ Enviado."));
  } catch (e) {
    const motivo = e instanceof ErroNegocio ? e.message : "Erro inesperado.";
    if (!(e instanceof ErroNegocio)) console.error("[telegram] Falha ao responder:", (e as Error).message);
    await enviarTexto(chatId, `⚠️ Não enviei: ${html(motivo)}`);
  }
}

// ---------- Escuta (long polling) ----------

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const lerOffset = () => Number(um<{ valor: string }>("SELECT valor FROM configuracoes WHERE chave = 'telegram_offset'")?.valor ?? 0);
const gravarOffset = (n: number) =>
  executar(
    `INSERT INTO configuracoes (chave, valor, atualizado_em) VALUES ('telegram_offset', ?, datetime('now'))
     ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`,
    String(n),
  );

/** Liga a escuta do bot (uma vez por processo). Sem TELEGRAM_BOT_TOKEN, não faz nada. */
export function iniciarTelegram() {
  const g = globalThis as typeof globalThis & { __dkTelegram?: boolean };
  if (g.__dkTelegram || !telegramAtivo()) return;
  g.__dkTelegram = true;

  // Comandos e nome do bot (o nome também pode ser mudado no @BotFather).
  api("setMyCommands", {
    commands: [
      { command: "ajuda", description: "Como responder aos clientes" },
      { command: "sair", description: "Parar de receber o atendimento aqui" },
    ],
  }).catch((e) => console.error("[telegram]", e.message));
  api("setMyName", { name: NOME_ATENDIMENTO }).catch(() => {});

  void (async () => {
    let offset = lerOffset();
    console.log("[telegram] Escutando o bot.");
    for (;;) {
      try {
        const atualizacoes = await api<{ update_id: number; message?: Mensagem }[]>("getUpdates", {
          offset,
          timeout: 30,
          allowed_updates: ["message"],
        });
        for (const a of atualizacoes) {
          offset = a.update_id + 1;
          gravarOffset(offset);
          if (a.message) await tratar(a.message).catch((e) => console.error("[telegram] Falha:", (e as Error).message));
        }
      } catch (e) {
        const msg = (e as Error).message;
        // 409: outro programa está ouvindo o mesmo bot (ex.: o mesmo token em outra máquina).
        console.error("[telegram] Falha na escuta:", msg);
        await espera(msg.includes("409") || msg.includes("Conflict") ? 60_000 : 5_000);
      }
    }
  })();
}
