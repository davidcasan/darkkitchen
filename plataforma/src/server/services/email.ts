import "server-only";
import nodemailer from "nodemailer";
import { executar, um, varios } from "../db";

// E-mails da plataforma (out/2026), enviados pela conta noreply@darkkitchen.art.br
// (UOL Host, SMTP). Configuração e senha ficam em plataforma/.env.local (fora do git).
//
// Fila: o e-mail é gravado em emails_fila na mesma transação do aviso que o gerou
// (se a operação falhar, nada sai). processarFilaEmails envia o que estiver pendente,
// a cada 30 segundos (instrumentation.ts) e logo depois de enfileirar; erros temporários
// são tentados de novo até TENTATIVAS vezes.

const TENTATIVAS = 5;

/** Contas de teste e endereços fictícios nunca recebem e-mail de verdade. */
const ENDERECO_DE_TESTE = /@(teste\.com|tmp\.local|example\.(com|org|net)|localhost)$/i;

const env = (nome: string) => process.env[nome]?.trim() || "";

export const emailConfigurado = () => !!(env("SMTP_HOST") && env("SMTP_USUARIO") && env("SMTP_SENHA"));

const urlDaPlataforma = () => (env("APP_URL") || "http://localhost:3000").replace(/\/$/, "");

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Layout simples (funciona em qualquer leitor de e-mail): marca, mensagem e um botão. */
function montarHtml(titulo: string, texto: string, link?: { url: string; rotulo: string }) {
  const paragrafos = texto
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapar(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const botao = link
    ? `<p style="margin:22px 0 6px"><a href="${escapar(link.url)}" style="display:inline-block;background:#ff4d2e;color:#140a06;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">${escapar(link.rotulo)}</a></p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f1ee;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0d0d0d;padding:18px 24px;font-weight:800;font-size:20px;line-height:0.95;color:#ffffff;letter-spacing:-0.3px">DARK<span style="color:#961a1d">&#9654;</span><br>KITCHEN</td></tr>
<tr><td style="padding:26px 24px 8px;font-size:15px">
<h1 style="margin:0 0 14px;font-size:20px">${escapar(titulo)}</h1>
${paragrafos}${botao}
</td></tr>
<tr><td style="padding:16px 24px 22px;font-size:12px;color:#78716c;border-top:1px solid #eee">Dark Kitchen Studio · motion graphics direto da cozinha.<br>Este é um aviso automático. Dúvidas? Fale com a gente pelo chat da sua área.</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * Põe um e-mail na fila. Use dentro da mesma transação do evento que o gerou.
 * link: caminho dentro da plataforma (ex.: "/cliente/conta") ou endereço completo.
 */
export function enfileirarEmail(dados: { para: string; assunto: string; texto: string; link?: string; rotuloLink?: string }) {
  const para = dados.para.trim().toLowerCase();
  if (!para || ENDERECO_DE_TESTE.test(para)) return;
  const url = dados.link ? (dados.link.startsWith("http") ? dados.link : urlDaPlataforma() + dados.link) : undefined;
  const corpoTexto = dados.texto + (url ? `\n\n${dados.rotuloLink ?? "Abrir na plataforma"}: ${url}` : "");
  const html = montarHtml(dados.assunto, dados.texto, url ? { url, rotulo: dados.rotuloLink ?? "Abrir na plataforma" } : undefined);
  executar(
    "INSERT INTO emails_fila (para, assunto, texto, html) VALUES (?, ?, ?, ?)",
    para,
    dados.assunto.slice(0, 200),
    corpoTexto,
    html,
  );
  agendarEnvio();
}

/** O que cada pessoa quer receber por e-mail (escolha na tela Conta). */
export type PreferenciaEmail = "todos" | "importantes" | "nenhum";
export const PREFERENCIAS_EMAIL: Record<PreferenciaEmail, string> = {
  todos: "Todos os avisos",
  importantes: "Só os importantes",
  nenhum: "Nenhum",
};

/**
 * E-mail de um aviso da plataforma para um usuário (se ele estiver ativo, tiver e-mail real
 * e quiser receber esse tipo de aviso). Boas-vindas e recuperação de senha não passam por
 * aqui: saem sempre.
 */
export function enfileirarEmailDeAviso(usuarioId: number, texto: string, link?: string, importante = false) {
  const u = um<{ email: string; nome: string; ativo: number; email_avisos: PreferenciaEmail }>(
    "SELECT email, nome, ativo, email_avisos FROM usuarios WHERE id = ?",
    usuarioId,
  );
  if (!u?.ativo) return;
  if (u.email_avisos === "nenhum" || (u.email_avisos === "importantes" && !importante)) return;
  const assunto = texto.length > 90 ? `${texto.slice(0, 87).replace(/\s+\S*$/, "")}...` : texto;
  enfileirarEmail({
    para: u.email,
    assunto: `Dark Kitchen · ${assunto.replace(/[.:]$/, "")}`,
    texto: `Olá, ${u.nome.split(" ")[0]}!\n\n${texto}`,
    link,
  });
}

let transporte: nodemailer.Transporter | null = null;
function obterTransporte() {
  if (!transporte) {
    const porta = Number(env("SMTP_PORT")) || 465;
    transporte = nodemailer.createTransport({
      host: env("SMTP_HOST"),
      port: porta,
      secure: porta === 465, // 465: SSL direto; 587: STARTTLS
      auth: { user: env("SMTP_USUARIO"), pass: env("SMTP_SENHA") },
      connectionTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }
  return transporte;
}

let enviando = false;
let agendado: NodeJS.Timeout | null = null;

/** Dispara o envio logo depois (fora da transação que gravou o e-mail). */
function agendarEnvio() {
  if (agendado) return;
  agendado = setTimeout(() => {
    agendado = null;
    processarFilaEmails().catch((e) => console.error("[dark-kitchen] Falha na fila de e-mails:", e));
  }, 1500);
}

/** Envia os e-mails pendentes. Devolve quantos saíram. */
export async function processarFilaEmails() {
  if (enviando || !emailConfigurado()) return 0;
  enviando = true;
  let enviados = 0;
  try {
    const fila = varios<{ id: number; para: string; assunto: string; texto: string; html: string; tentativas: number }>(
      `SELECT id, para, assunto, texto, html, tentativas FROM emails_fila
       WHERE status = 'pendente' AND (proxima_tentativa IS NULL OR proxima_tentativa <= datetime('now'))
       ORDER BY id LIMIT 20`,
    );
    for (const e of fila) {
      try {
        await obterTransporte().sendMail({
          from: env("EMAIL_REMETENTE") || env("SMTP_USUARIO"),
          replyTo: env("EMAIL_RESPONDER_PARA") || undefined,
          to: e.para,
          subject: e.assunto,
          text: e.texto,
          html: e.html,
        });
        executar("UPDATE emails_fila SET status = 'enviado', enviado_em = datetime('now'), erro = NULL WHERE id = ?", e.id);
        enviados++;
      } catch (erro) {
        const msg = erro instanceof Error ? erro.message.slice(0, 300) : String(erro);
        if (/EAUTH|535|authentication/i.test(msg)) {
          // Login recusado (senha errada ou conta inativa): é problema de configuração, não
          // do e-mail. Nada perde tentativa; tudo espera 30 minutos (insistir pode fazer o
          // servidor bloquear o acesso por um tempo).
          executar("UPDATE emails_fila SET erro = ?, proxima_tentativa = datetime('now', '+30 minutes') WHERE status = 'pendente'", msg);
          transporte = null; // relê a configuração na próxima vez
          console.error(`[dark-kitchen] E-mails parados: o servidor de e-mail recusou o login (${msg}). Confira SMTP_USUARIO e SMTP_SENHA no .env.local.`);
          break;
        }
        const tentativas = e.tentativas + 1;
        // Espera cada vez mais entre as tentativas: 1, 4, 9, 16 minutos.
        executar(
          `UPDATE emails_fila SET tentativas = ?, erro = ?, status = ?, proxima_tentativa = datetime('now', ?) WHERE id = ?`,
          tentativas,
          msg,
          tentativas >= TENTATIVAS ? "falhou" : "pendente",
          `+${tentativas * tentativas} minutes`,
          e.id,
        );
        console.error(`[dark-kitchen] E-mail para ${e.para} não saiu (tentativa ${tentativas}): ${msg}`);
      }
    }
  } finally {
    enviando = false;
  }
  return enviados;
}

/** Situação da fila (para a tela do admin). */
export const resumoEmails = () => ({
  configurado: emailConfigurado(),
  ...um<{ pendentes: number; enviados: number; falhas: number }>(
    `SELECT SUM(status = 'pendente') pendentes, SUM(status = 'enviado' AND enviado_em > datetime('now', '-30 days')) enviados,
            SUM(status = 'falhou') falhas FROM emails_fila`,
  )!,
  ultimoErro: um<{ erro: string; criado_em: string }>("SELECT erro, criado_em FROM emails_fila WHERE erro IS NOT NULL ORDER BY id DESC LIMIT 1"),
});
