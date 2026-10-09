import "server-only";
import { ErroNegocio, executar, um } from "../db";

// Limite de tentativas (out/2026): impede adivinhar senhas e encher caixas de e-mail.
// Cada regra conta falhas por chave (e-mail ou IP) numa janela de tempo; passou do
// limite, a chave fica bloqueada por alguns minutos. Um login certo zera a conta do e-mail.

export interface Regra {
  prefixo: string;
  maximo: number; // falhas permitidas dentro da janela
  janelaMin: number;
  bloqueioMin: number;
}

/** Senha errada para o mesmo e-mail: 5 em 15 minutos → espera 15 minutos. */
export const LOGIN_EMAIL: Regra = { prefixo: "login-email", maximo: 5, janelaMin: 15, bloqueioMin: 15 };
/** Senhas erradas vindas do mesmo IP (vários e-mails): 20 em 15 minutos → espera 15 minutos. */
export const LOGIN_IP: Regra = { prefixo: "login-ip", maximo: 20, janelaMin: 15, bloqueioMin: 15 };
/** Pedidos de "esqueci minha senha" do mesmo IP: 10 por hora. */
export const RECUPERACAO_IP: Regra = { prefixo: "recuperar-ip", maximo: 10, janelaMin: 60, bloqueioMin: 60 };

const chaveDe = (r: Regra, valor: string) => `${r.prefixo}:${valor.trim().toLowerCase()}`;

/** Lança erro (HTTP 429) se alguma das chaves estiver bloqueada. */
export function conferirLimite(...itens: [Regra, string][]) {
  for (const [regra, valor] of itens) {
    const b = um<{ minutos: number }>(
      `SELECT CAST((julianday(bloqueado_ate) - julianday('now')) * 1440 + 0.999 AS INTEGER) minutos
       FROM limites_tentativas WHERE chave = ? AND bloqueado_ate > datetime('now')`,
      chaveDe(regra, valor),
    );
    if (b)
      throw new ErroNegocio(
        `Muitas tentativas seguidas. Por segurança, tente de novo em ${Math.max(1, b.minutos)} ${b.minutos > 1 ? "minutos" : "minuto"}.`,
        429,
      );
  }
}

/** Conta uma falha (ou um pedido, no caso da recuperação) para cada chave. */
export function registrarTentativa(...itens: [Regra, string][]) {
  for (const [regra, valor] of itens) {
    const chave = chaveDe(regra, valor);
    // Janela vencida: recomeça a contagem.
    executar(
      `INSERT INTO limites_tentativas (chave, falhas, janela_desde) VALUES (?, 1, datetime('now'))
       ON CONFLICT(chave) DO UPDATE SET
         falhas = CASE WHEN janela_desde < datetime('now', ?) THEN 1 ELSE falhas + 1 END,
         janela_desde = CASE WHEN janela_desde < datetime('now', ?) THEN datetime('now') ELSE janela_desde END`,
      chave,
      `-${regra.janelaMin} minutes`,
      `-${regra.janelaMin} minutes`,
    );
    executar(
      `UPDATE limites_tentativas SET bloqueado_ate = datetime('now', ?), falhas = 0, janela_desde = datetime('now')
       WHERE chave = ? AND falhas >= ?`,
      `+${regra.bloqueioMin} minutes`,
      chave,
      regra.maximo,
    );
  }
}

export function zerarTentativas(...itens: [Regra, string][]) {
  for (const [regra, valor] of itens) executar("DELETE FROM limites_tentativas WHERE chave = ?", chaveDe(regra, valor));
}

/** Limpeza: some com bloqueios e janelas antigas (roda junto das tarefas periódicas). */
export function limparTentativasAntigas() {
  executar(
    "DELETE FROM limites_tentativas WHERE (bloqueado_ate IS NULL OR bloqueado_ate < datetime('now')) AND janela_desde < datetime('now', '-1 day')",
  );
}
