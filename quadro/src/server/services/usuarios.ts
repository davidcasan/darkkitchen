import "server-only";
import { planoPorId } from "@/domain/precos";
import { precos } from "./precos";
import { ErroNegocio, executar, transacao, um, varios } from "../db";
import type { Usuario } from "../auth";
import { hashSenha, verificarSenha } from "../senha";
import { assinar } from "./assinaturas";
import { adicionarMetodo } from "./pagamentos";
import { criarMarca } from "./marcas";

const CAMPOS = "id, papel, nome, email, empresa, senior";

export function autenticar(email: string, senha: string): Usuario {
  const u = um<Usuario & { senha_hash: string }>(
    `SELECT ${CAMPOS}, senha_hash FROM usuarios WHERE email = ? AND ativo = 1`,
    email.trim(),
  );
  if (!u || !verificarSenha(senha, u.senha_hash)) throw new ErroNegocio("E-mail ou senha incorretos.", 401);
  return usuarioPorId(u.id)!;
}

export interface DadosCadastro {
  nome: string;
  empresa: string;
  email: string;
  senha: string;
  planoId: string;
  metodo: "cartao" | "pix";
  cartaoFinal?: string;
}

export function cadastrarCliente(d: DadosCadastro): Usuario {
  const nome = d.nome.trim();
  const email = d.email.trim().toLowerCase();
  if (nome.length < 2) throw new ErroNegocio("Informe seu nome.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ErroNegocio("Digite um e-mail válido.");
  if (d.senha.length < 8) throw new ErroNegocio("A senha precisa ter pelo menos 8 caracteres.");
  if (!planoPorId(precos(), d.planoId)?.ativo) throw new ErroNegocio("Escolha um plano.");
  if (um("SELECT id FROM usuarios WHERE email = ?", email)) throw new ErroNegocio("Já existe uma conta com esse e-mail.");

  return transacao(() => {
    const id = executar(
      "INSERT INTO usuarios (papel, nome, email, senha_hash, empresa) VALUES ('cliente', ?, ?, ?, ?)",
      nome,
      email,
      hashSenha(d.senha),
      d.empresa.trim() || null,
    ).id;
    criarMarca(id, d.empresa.trim() || nome);
    adicionarMetodo(id, d.metodo, d.cartaoFinal);
    assinar(id, d.planoId);
    return um<Usuario>(`SELECT ${CAMPOS} FROM usuarios WHERE id = ?`, id)!;
  });
}

export const usuarioPorId = (id: number) => um<Usuario>(`SELECT ${CAMPOS} FROM usuarios WHERE id = ?`, id);

export const listarDesigners = () =>
  varios<Usuario & { ativos: number }>(
    `SELECT u.id, u.papel, u.nome, u.email, u.empresa, u.senior,
      (SELECT COUNT(*) FROM pedidos p WHERE p.designer_id = u.id AND p.status NOT IN ('aprovado','cancelado')) ativos
     FROM usuarios u WHERE u.papel = 'designer' AND u.ativo = 1 ORDER BY u.senior DESC, u.nome`,
  );

export function alterarSenha(usuarioId: number, atual: string, nova: string) {
  const u = um<{ senha_hash: string }>("SELECT senha_hash FROM usuarios WHERE id = ?", usuarioId);
  if (!u || !verificarSenha(atual, u.senha_hash)) throw new ErroNegocio("A senha atual está incorreta.");
  if (nova.length < 8) throw new ErroNegocio("A nova senha precisa ter pelo menos 8 caracteres.");
  executar("UPDATE usuarios SET senha_hash = ? WHERE id = ?", hashSenha(nova), usuarioId);
}
