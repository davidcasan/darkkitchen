import "server-only";
import { ErroNegocio, executar, transacao, um, varios } from "../db";
import type { Usuario } from "../auth";
import { TERMOS_PADRAO } from "../termosPadrao";

// Termos de Uso (out/2026): texto em markdown simples, editado pelo admin em
// Equipe → Termos de uso. Cada salvamento é uma versão nova (configuracoes, chave
// "termos"; histórico em configuracoes_historico). O cliente aceita a versão em vigor
// ao criar a conta, e o aceite fica em termos_aceites (versão, data, IP, navegador).

const CHAVE = "termos";

export interface Termos {
  texto: string;
  versao: number;
  atualizado_em: string | null; // null = texto padrão, nunca salvo
}

export function termosAtuais(): Termos {
  const linha = um<{ valor: string; atualizado_em: string }>("SELECT valor, atualizado_em FROM configuracoes WHERE chave = ?", CHAVE);
  if (!linha) return { texto: TERMOS_PADRAO, versao: 1, atualizado_em: null };
  try {
    const v = JSON.parse(linha.valor) as { texto: string; versao: number };
    return { texto: v.texto, versao: v.versao, atualizado_em: linha.atualizado_em };
  } catch {
    return { texto: TERMOS_PADRAO, versao: 1, atualizado_em: null };
  }
}

/** Publica uma versão nova. Quem já aceitou continua com o aceite da versão anterior registrado. */
export function salvarTermos(admin: Usuario, texto: string) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador altera os Termos de Uso.", 403);
  const limpo = texto.replace(/\r\n/g, "\n").trim();
  if (limpo.length < 200) throw new ErroNegocio("O texto dos termos ficou curto demais. Confira se colou o texto inteiro.");
  if (limpo.length > 100_000) throw new ErroNegocio("O texto passou do limite de 100 mil caracteres.");
  const atual = termosAtuais();
  // O texto padrão é a versão 1; cada salvamento com mudança gera a próxima.
  if (limpo === atual.texto.trim()) throw new ErroNegocio("Nada mudou no texto.");
  const versao = atual.versao + 1;
  const valor = JSON.stringify({ texto: limpo, versao });
  transacao(() => {
    executar(
      `INSERT INTO configuracoes (chave, valor, atualizado_em, atualizado_por) VALUES (?, ?, datetime('now'), ?)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`,
      CHAVE,
      valor,
      admin.id,
    );
    executar(
      "INSERT INTO configuracoes_historico (chave, valor, autor_id, resumo) VALUES (?, ?, ?, ?)",
      CHAVE,
      valor,
      admin.id,
      `Versão ${versao} publicada`,
    );
  });
  return versao;
}

export const historicoTermos = (limite = 20) =>
  varios<{ id: number; resumo: string; autor: string | null; criado_em: string }>(
    `SELECT h.id, h.resumo, u.nome autor, h.criado_em FROM configuracoes_historico h
     LEFT JOIN usuarios u ON u.id = h.autor_id WHERE h.chave = ? ORDER BY h.id DESC LIMIT ?`,
    CHAVE,
    limite,
  );

export function registrarAceite(usuarioId: number, versao: number, ip: string, navegador: string) {
  executar(
    "INSERT INTO termos_aceites (usuario_id, versao, ip, navegador) VALUES (?, ?, ?, ?)",
    usuarioId,
    versao,
    ip.slice(0, 64),
    navegador.slice(0, 300),
  );
}

export const aceitesDo = (usuarioId: number) =>
  varios<{ versao: number; ip: string | null; criado_em: string }>(
    "SELECT versao, ip, criado_em FROM termos_aceites WHERE usuario_id = ? ORDER BY id DESC",
    usuarioId,
  );

/** Quantos clientes aceitaram cada versão (tela do admin). */
export const aceitesPorVersao = () =>
  varios<{ versao: number; n: number }>(
    "SELECT versao, COUNT(DISTINCT usuario_id) n FROM termos_aceites GROUP BY versao ORDER BY versao DESC",
  );
