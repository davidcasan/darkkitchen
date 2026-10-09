import "server-only";
import crypto from "node:crypto";
import { type Papel, PAPEIS } from "@/domain/pedido";
import { ErroNegocio, executar, transacao, um, varios } from "../db";
import type { Usuario } from "../auth";
import { hashSenha } from "../senha";
import { lancar, saldo } from "./creditos";
import { notificar } from "./notificacoes";
import { criarMarca } from "./marcas";

// Gerenciamento de contas (somente admin): clientes e colaboradores.

export interface Conta {
  id: number;
  papel: Papel;
  nome: string;
  email: string;
  empresa: string | null;
  senior: number;
  ativo: number;
  criado_em: string;
  pedidos: number;
  ativos: number; // pedidos em andamento (do cliente ou atribuídos ao designer)
  saldo: number | null;
}

const PAPEIS_VALIDOS = Object.keys(PAPEIS) as Papel[];

function exigirAdmin(u: Usuario) {
  if (u.papel !== "admin") throw new ErroNegocio("Somente o administrador gerencia contas.", 403);
}

const SELECT_CONTA = `
  SELECT u.id, u.papel, u.nome, u.email, u.empresa, u.senior, u.ativo, u.criado_em,
    (SELECT COUNT(*) FROM pedidos p WHERE p.cliente_id = u.id OR p.designer_id = u.id) pedidos,
    (SELECT COUNT(*) FROM pedidos p WHERE (p.cliente_id = u.id OR p.designer_id = u.id)
       AND p.status NOT IN ('aprovado','cancelado')) ativos,
    CASE WHEN u.papel = 'cliente' THEN (SELECT COALESCE(SUM(quantidade), 0) FROM creditos c WHERE c.usuario_id = u.id) END saldo
  FROM usuarios u`;

export function listarContas(admin: Usuario, filtro: { tipo: "clientes" | "equipe"; busca?: string; inativos?: boolean }) {
  exigirAdmin(admin);
  const where = [filtro.tipo === "clientes" ? "u.papel = 'cliente'" : "u.papel != 'cliente'"];
  const params: string[] = [];
  if (!filtro.inativos) where.push("u.ativo = 1");
  if (filtro.busca?.trim()) {
    where.push("(u.nome LIKE ? OR u.email LIKE ? OR COALESCE(u.empresa, '') LIKE ?)");
    const t = `%${filtro.busca.trim()}%`;
    params.push(t, t, t);
  }
  return varios<Conta>(`${SELECT_CONTA} WHERE ${where.join(" AND ")} ORDER BY u.ativo DESC, u.nome`, ...params);
}

export function contaPorId(admin: Usuario, id: number): Conta {
  exigirAdmin(admin);
  const c = um<Conta>(`${SELECT_CONTA} WHERE u.id = ?`, id);
  if (!c) throw new ErroNegocio("Conta não encontrada.", 404);
  return c;
}

/** Senha temporária legível (sem caracteres ambíguos), mostrada uma única vez ao admin. */
function senhaTemporaria() {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(10), (b) => letras[b % letras.length]).join("");
}

export interface DadosConta {
  nome: string;
  email: string;
  papel: string;
  empresa: string;
  senior: boolean;
}

function validar(d: DadosConta, idAtual?: number) {
  const nome = d.nome.trim();
  const email = d.email.trim().toLowerCase();
  if (nome.length < 2) throw new ErroNegocio("Informe o nome.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ErroNegocio("Digite um e-mail válido.");
  if (!PAPEIS_VALIDOS.includes(d.papel as Papel)) throw new ErroNegocio("Escolha o tipo de conta.");
  const dono = um<{ id: number }>("SELECT id FROM usuarios WHERE email = ?", email);
  if (dono && dono.id !== idAtual) throw new ErroNegocio("Já existe uma conta com esse e-mail.");
  return { nome, email, papel: d.papel as Papel, empresa: d.empresa.trim() || null, senior: d.senior && d.papel === "designer" ? 1 : 0 };
}

/** Cria a conta e devolve a senha (a informada ou uma temporária gerada). */
export function criarConta(admin: Usuario, d: DadosConta & { senha: string; creditos: number }): { id: number; senha: string } {
  exigirAdmin(admin);
  const v = validar(d);
  const senha = d.senha.trim() || senhaTemporaria();
  if (senha.length < 8) throw new ErroNegocio("A senha precisa ter pelo menos 8 caracteres.");
  return transacao(() => {
    const id = executar(
      "INSERT INTO usuarios (papel, nome, email, senha_hash, empresa, senior) VALUES (?, ?, ?, ?, ?, ?)",
      v.papel,
      v.nome,
      v.email,
      hashSenha(senha),
      v.empresa,
      v.senior,
    ).id;
    if (v.papel === "cliente") {
      criarMarca(id, v.empresa ?? v.nome);
      if (d.creditos > 0) lancar(id, Math.floor(d.creditos), "ajuste", `Créditos iniciais (por ${admin.nome})`);
    }
    return { id, senha };
  });
}

export function atualizarConta(admin: Usuario, id: number, d: DadosConta) {
  const atual = contaPorId(admin, id);
  const v = validar(d, id);
  if (id === admin.id && v.papel !== "admin") throw new ErroNegocio("Você não pode tirar o próprio acesso de administrador.");
  if ((atual.papel === "cliente") !== (v.papel === "cliente") && atual.pedidos > 0)
    throw new ErroNegocio("Esta conta já tem pedidos: não dá para trocar entre cliente e colaborador. Crie outra conta.");
  if (atual.papel === "designer" && v.papel !== "designer" && atual.ativos > 0)
    throw new ErroNegocio(`Este designer tem ${atual.ativos} pedido(s) em andamento. Reatribua antes de mudar o tipo da conta.`);
  executar(
    "UPDATE usuarios SET nome = ?, email = ?, papel = ?, empresa = ?, senior = ? WHERE id = ?",
    v.nome,
    v.email,
    v.papel,
    v.empresa,
    v.senior,
    id,
  );
  if (v.papel === "cliente" && !um("SELECT 1 FROM marcas WHERE usuario_id = ?", id)) criarMarca(id, v.empresa ?? v.nome);
}

/** Gera uma senha temporária e encerra todas as sessões da conta. */
export function redefinirSenha(admin: Usuario, id: number): string {
  contaPorId(admin, id);
  const senha = senhaTemporaria();
  transacao(() => {
    executar("UPDATE usuarios SET senha_hash = ? WHERE id = ?", hashSenha(senha), id);
    executar("DELETE FROM sessoes WHERE usuario_id = ?", id);
  });
  return senha;
}

/**
 * Remove a conta. Sem nenhum histórico (pedidos, arquivos, créditos, comentários), apaga de vez.
 * Com histórico, desativa: a pessoa não consegue mais entrar, mas pedidos e extrato continuam íntegros.
 */
export function removerConta(admin: Usuario, id: number): "removida" | "desativada" {
  const c = contaPorId(admin, id);
  if (id === admin.id) throw new ErroNegocio("Você não pode remover a própria conta.");
  if (c.ativos > 0)
    throw new ErroNegocio(
      c.papel === "cliente"
        ? `Este cliente tem ${c.ativos} pedido(s) em andamento. Conclua ou cancele antes.`
        : `Esta pessoa tem ${c.ativos} pedido(s) em andamento. Reatribua antes de remover.`,
    );
  const historico = um<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM pedidos WHERE cliente_id = ?1 OR designer_id = ?1)
          + (SELECT COUNT(*) FROM arquivos WHERE dono_id = ?1)
          + (SELECT COUNT(*) FROM creditos WHERE usuario_id = ?1)
          + (SELECT COUNT(*) FROM comentarios WHERE autor_id = ?1)
          + (SELECT COUNT(*) FROM versoes WHERE autor_id = ?1)
          + (SELECT COUNT(*) FROM eventos WHERE autor_id = ?1)
          + (SELECT COUNT(*) FROM faturas WHERE usuario_id = ?1) n`,
    id,
  )!.n;
  return transacao(() => {
    executar("DELETE FROM sessoes WHERE usuario_id = ?", id);
    if (historico > 0) {
      executar("UPDATE usuarios SET ativo = 0 WHERE id = ?", id);
      executar("UPDATE assinaturas SET status = 'cancelada' WHERE usuario_id = ?", id);
      return "desativada";
    }
    executar("DELETE FROM usuarios WHERE id = ?", id); // marcas, métodos, notificações saem em cascata
    return "removida";
  });
}

export function reativarConta(admin: Usuario, id: number) {
  contaPorId(admin, id);
  executar("UPDATE usuarios SET ativo = 1 WHERE id = ?", id);
}

/** Ajuste manual no extrato de um cliente (crédito de cortesia, correção, etc.). */
export function ajustarCreditos(admin: Usuario, clienteId: number, quantidade: number, motivo: string) {
  const c = contaPorId(admin, clienteId);
  if (c.papel !== "cliente") throw new ErroNegocio("Créditos só existem em contas de cliente.");
  const q = Math.trunc(quantidade);
  if (!q) throw new ErroNegocio("Informe a quantidade (positiva para dar, negativa para tirar).");
  if (motivo.trim().length < 3) throw new ErroNegocio("Informe o motivo do ajuste.");
  if (saldo(clienteId) + q < 0) throw new ErroNegocio("O saldo do cliente não pode ficar negativo.");
  transacao(() => {
    lancar(clienteId, q, "ajuste", `${motivo.trim().slice(0, 200)} (por ${admin.nome})`);
    notificar(
      clienteId,
      q > 0 ? `Você recebeu ${q} créditos: ${motivo.trim()}.` : `${-q} créditos foram retirados do seu saldo: ${motivo.trim()}.`,
      "/cliente/creditos",
    );
  });
}
