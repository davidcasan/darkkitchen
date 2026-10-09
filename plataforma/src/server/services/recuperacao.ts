import "server-only";
import crypto from "node:crypto";
import { ErroNegocio, executar, transacao, um } from "../db";
import { hashSenha } from "../senha";
import { enfileirarEmail } from "./email";

// Recuperação de senha (out/2026): a pessoa informa o e-mail e recebe um link de uso
// único, válido por VALIDADE_MINUTOS. No banco fica só o resumo (hash) do código.
// A tela responde sempre a mesma coisa, exista ou não a conta (não revela quem é cliente).

const VALIDADE_MINUTOS = 60;
const LIMITE_POR_HORA = 3;

const resumo = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Endereço usado no link do e-mail: o da página por onde a pessoa pediu, se for um endereço
 * conhecido (local, rede local, túnel do Cloudflare ou o APP_URL); senão, o APP_URL.
 * Evita que alguém forje o cabeçalho Host para mandar um link para outro site.
 */
export function enderecoConfiavel(host: string | null, protocolo: string | null) {
  const appUrl = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
  if (!host) return appUrl;
  const nome = host.split(":")[0].toLowerCase();
  const permitido =
    nome === "localhost" ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(nome) ||
    nome.endsWith(".trycloudflare.com") ||
    nome === new URL(appUrl).hostname;
  if (!permitido) return appUrl;
  const proto = protocolo?.split(",")[0].trim() || (nome === "localhost" || /^\d/.test(nome) ? "http" : "https");
  return `${proto}://${host}`;
}

/** Pede o link de nova senha. Não diz se o e-mail existe. */
export function pedirRecuperacao(email: string, baseUrl: string) {
  const u = um<{ id: number; nome: string; email: string }>(
    "SELECT id, nome, email FROM usuarios WHERE email = ? AND ativo = 1",
    email.trim().toLowerCase(),
  );
  if (!u) return;
  const recentes = um<{ n: number }>(
    "SELECT COUNT(*) n FROM senha_tokens WHERE usuario_id = ? AND criado_em > datetime('now', '-1 hour')",
    u.id,
  )!.n;
  if (recentes >= LIMITE_POR_HORA) return; // evita lotar a caixa da pessoa
  const token = crypto.randomBytes(32).toString("base64url");
  transacao(() => {
    executar(
      "INSERT INTO senha_tokens (token_hash, usuario_id, expira_em) VALUES (?, ?, datetime('now', ?))",
      resumo(token),
      u.id,
      `+${VALIDADE_MINUTOS} minutes`,
    );
    enfileirarEmail({
      para: u.email,
      assunto: "Dark Kitchen · Redefinir sua senha",
      texto: `Olá, ${u.nome.split(" ")[0]}!\n\nRecebemos um pedido para criar uma nova senha para a sua conta. O link abaixo vale por 1 hora e só pode ser usado uma vez.\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.`,
      link: `${baseUrl}/redefinir-senha?token=${token}`,
      rotuloLink: "Criar nova senha",
    });
  });
}

/** Confere o link: devolve o nome da pessoa, ou null se o link for inválido, usado ou vencido. */
export function conferirLink(token: string) {
  if (!token) return null;
  return (
    um<{ nome: string; email: string }>(
      `SELECT u.nome, u.email FROM senha_tokens t JOIN usuarios u ON u.id = t.usuario_id
       WHERE t.token_hash = ? AND t.usado_em IS NULL AND t.expira_em > datetime('now') AND u.ativo = 1`,
      resumo(token),
    ) ?? null
  );
}

/** Grava a nova senha, invalida o link e encerra as sessões abertas (por segurança). */
export function redefinirSenha(token: string, nova: string, confirma: string) {
  if (nova.length < 8) throw new ErroNegocio("A nova senha precisa ter pelo menos 8 caracteres.");
  if (nova !== confirma) throw new ErroNegocio("A confirmação não confere com a nova senha.");
  transacao(() => {
    const t = um<{ usuario_id: number; email: string; nome: string }>(
      `SELECT t.usuario_id, u.email, u.nome FROM senha_tokens t JOIN usuarios u ON u.id = t.usuario_id
       WHERE t.token_hash = ? AND t.usado_em IS NULL AND t.expira_em > datetime('now') AND u.ativo = 1`,
      resumo(token),
    );
    if (!t) throw new ErroNegocio("Este link não vale mais. Peça um novo na tela de recuperação de senha.");
    executar("UPDATE usuarios SET senha_hash = ? WHERE id = ?", hashSenha(nova), t.usuario_id);
    executar("UPDATE senha_tokens SET usado_em = datetime('now') WHERE usuario_id = ? AND usado_em IS NULL", t.usuario_id);
    executar("DELETE FROM sessoes WHERE usuario_id = ?", t.usuario_id);
    enfileirarEmail({
      para: t.email,
      assunto: "Dark Kitchen · Sua senha foi alterada",
      texto: `Olá, ${t.nome.split(" ")[0]}!\n\nA senha da sua conta acabou de ser alterada. Se foi você, está tudo certo.\n\nSe não foi você, fale com a gente imediatamente pelo e-mail contato@darkkitchen.art.br.`,
    });
  });
}
