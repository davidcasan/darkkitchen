import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Banco SQLite local (arquivo em data/quadro.db). Todo acesso passa pelos
// serviços em src/server/services, então trocar por PostgreSQL no servidor
// online significa reescrever só esta camada, sem tocar nas telas.

export const PASTA_DADOS = path.join(process.cwd(), "data");
export const PASTA_ARQUIVOS = path.join(PASTA_DADOS, "arquivos");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  papel TEXT NOT NULL CHECK (papel IN ('cliente','designer','gerente','diretor','admin')),
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  empresa TEXT,
  senior INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metodos_pagamento (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('cartao','pix')),
  descricao TEXT NOT NULL,
  padrao INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assinaturas (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  plano_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ativa','cancelada')),
  periodo_inicio TEXT NOT NULL,
  periodo_fim TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faturas (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paga','pendente','falhou')),
  metodo TEXT NOT NULL,
  referencia_gateway TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Extrato de créditos: o saldo é sempre a soma. Nunca se edita uma linha.
CREATE TABLE IF NOT EXISTS creditos (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('assinatura','compra','pedido','revisao_extra','estorno','ajuste')),
  descricao TEXT NOT NULL,
  pedido_id INTEGER REFERENCES pedidos(id),
  fatura_id INTEGER REFERENCES faturas(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS marcas (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  cores TEXT NOT NULL DEFAULT '[]',
  observacoes TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY,
  codigo TEXT UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  briefing TEXT NOT NULL,
  creditos INTEGER NOT NULL,
  urgente INTEGER NOT NULL DEFAULT 0,
  dias_uteis INTEGER NOT NULL,
  revisoes_incluidas INTEGER NOT NULL,
  revisoes_usadas INTEGER NOT NULL DEFAULT 0,
  tentativas_internas INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  designer_id INTEGER REFERENCES usuarios(id),
  entrega_prevista TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS arquivos (
  id INTEGER PRIMARY KEY,
  dono_id INTEGER NOT NULL REFERENCES usuarios(id),
  pedido_id INTEGER REFERENCES pedidos(id),
  versao_id INTEGER REFERENCES versoes(id),
  categoria TEXT NOT NULL CHECK (categoria IN ('logo','manual','foto','versao','entrega','anexo')),
  nome TEXT NOT NULL,
  caminho TEXT NOT NULL,
  mime TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS versoes (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  numero INTEGER NOT NULL,
  arquivo_id INTEGER NOT NULL REFERENCES arquivos(id),
  autor_id INTEGER NOT NULL REFERENCES usuarios(id),
  nota TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('qualidade','reprovada','com_cliente','ajuste','aprovada','rejeitada')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comentarios (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  versao_id INTEGER REFERENCES versoes(id),
  autor_id INTEGER NOT NULL REFERENCES usuarios(id),
  texto TEXT NOT NULL,
  tempo REAL,
  interno INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Histórico do pedido, incluindo todo motivo de reprovação (métrica de aprovação de primeira).
CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  autor_id INTEGER REFERENCES usuarios(id),
  tipo TEXT NOT NULL,
  de TEXT,
  para TEXT,
  detalhe TEXT NOT NULL DEFAULT '{}',
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notificacoes (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  link TEXT,
  lida INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_creditos_usuario ON creditos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_eventos_pedido ON eventos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_pedido ON comentarios(pedido_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario ON notificacoes(usuario_id, lida);
`;

type GlobalDb = typeof globalThis & { __quadroDb?: DatabaseSync };

function abrir(): DatabaseSync {
  fs.mkdirSync(PASTA_ARQUIVOS, { recursive: true });
  const db = new DatabaseSync(path.join(PASTA_DADOS, "quadro.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}

/** Conexão única, reaproveitada entre recarregamentos do modo de desenvolvimento. */
export function db(): DatabaseSync {
  const g = globalThis as GlobalDb;
  if (!g.__quadroDb) g.__quadroDb = abrir();
  return g.__quadroDb;
}

let profundidade = 0;

/**
 * Executa várias escritas como uma só: ou todas acontecem, ou nenhuma.
 * Se já houver uma transação aberta, participa dela (os serviços se chamam entre si).
 */
export function transacao<T>(fn: () => T): T {
  if (profundidade > 0) return fn();
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  profundidade++;
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  } finally {
    profundidade--;
  }
}

type Valor = string | number | null;

// O node:sqlite devolve objetos sem protótipo; o React só aceita objetos comuns
// ao passar dados para componentes do navegador, então cada linha é copiada.
export const um = <T>(sql: string, ...p: Valor[]) => {
  const r = db().prepare(sql).get(...p);
  return (r ? { ...r } : undefined) as T | undefined;
};
export const varios = <T>(sql: string, ...p: Valor[]) => db().prepare(sql).all(...p).map((r) => ({ ...r })) as T[];
export const executar = (sql: string, ...p: Valor[]) => {
  const r = db().prepare(sql).run(...p);
  return { id: Number(r.lastInsertRowid), alterados: Number(r.changes) };
};

/** Erro de regra de negócio, com mensagem pronta para mostrar ao usuário. */
export class ErroNegocio extends Error {
  constructor(
    mensagem: string,
    public status = 400,
  ) {
    super(mensagem);
  }
}
