import "server-only";
import { executar, transacao, um } from "./db";
import { hashSenha } from "./senha";

// Modo produção (npm run producao / next start). Diferente do desenvolvimento:
// - Banco vazio: NÃO cria os dados de teste. Cria só o admin real, com o e-mail e a
//   senha inicial do .env.local (ADMIN_EMAIL, ADMIN_NOME, ADMIN_SENHA_INICIAL).
//   Depois do primeiro acesso, troque a senha na tela Conta e apague ADMIN_SENHA_INICIAL.
// - Contas de teste (@teste.com, senha conhecida) que estiverem no banco são desativadas.

const ENDERECO_DE_TESTE = "%@teste.com";

export function prepararProducao() {
  const desativadas = transacao(() => {
    const n = executar("UPDATE usuarios SET ativo = 0 WHERE email LIKE ? AND ativo = 1", ENDERECO_DE_TESTE).alterados;
    executar("DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE ?)", ENDERECO_DE_TESTE);
    return n;
  });
  if (desativadas) console.log(`[dark-kitchen] Produção: ${desativadas} conta(s) de teste desativada(s).`);

  if (um("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo = 1 LIMIT 1")) return;

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const nome = process.env.ADMIN_NOME?.trim() || "Administrador";
  const senha = process.env.ADMIN_SENHA_INICIAL ?? "";
  if (!/^\S+@\S+\.\S+$/.test(email) || senha.length < 10) {
    console.error(
      "[dark-kitchen] Produção: não há nenhum admin ativo. Defina ADMIN_EMAIL e ADMIN_SENHA_INICIAL (mínimo 10 caracteres) no .env.local e reinicie o servidor.",
    );
    return;
  }
  const existente = um<{ id: number }>("SELECT id FROM usuarios WHERE email = ?", email);
  if (existente) {
    // A conta já existe (ex.: dados levados do desenvolvimento): vira admin e é reativada.
    executar("UPDATE usuarios SET papel = 'admin', ativo = 1 WHERE id = ?", existente.id);
    console.log(`[dark-kitchen] Produção: ${email} agora é admin (senha mantida).`);
    return;
  }
  executar(
    "INSERT INTO usuarios (papel, nome, email, senha_hash) VALUES ('admin', ?, ?, ?)",
    nome,
    email,
    hashSenha(senha),
  );
  console.log(`[dark-kitchen] Produção: admin ${email} criado. Entre, troque a senha em Conta e apague ADMIN_SENHA_INICIAL do .env.local.`);
}
