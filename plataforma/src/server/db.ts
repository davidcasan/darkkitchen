import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Banco SQLite local (arquivo em data/dark-kitchen.db). Todo acesso passa pelos
// serviços em src/server/services, então trocar por PostgreSQL no servidor
// online significa reescrever só esta camada, sem tocar nas telas.

// Pasta do banco e dos arquivos. DK_DADOS troca o local (ex.: testar a produção numa pasta à parte).
export const PASTA_DADOS = process.env.DK_DADOS ? path.resolve(process.env.DK_DADOS) : path.join(process.cwd(), "data");
export const PASTA_ARQUIVOS = path.join(PASTA_DADOS, "arquivos");

// Um cliente pode ter várias marcas; cada uma guarda seus próprios assets (logo, manual, cores).
const SQL_MARCAS = `
CREATE TABLE IF NOT EXISTS marcas (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cores TEXT NOT NULL DEFAULT '[]',
  observacoes TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  papel TEXT NOT NULL CHECK (papel IN ('cliente','designer','gerente','diretor','admin')), -- 'gerente' só por compatibilidade: virou 'diretor'
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  empresa TEXT,
  senior INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
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
  status TEXT NOT NULL CHECK (status IN ('ativa','cancelada','pendente')),
  periodo_inicio TEXT NOT NULL,
  periodo_fim TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faturas (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paga','pendente','falhou','cancelada')),
  metodo TEXT NOT NULL,
  referencia_gateway TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Extrato de créditos: o saldo é sempre a soma. Nunca se edita uma linha.
CREATE TABLE IF NOT EXISTS creditos (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('assinatura','compra','pedido','revisao_extra','estorno','ajuste','expiracao')),
  descricao TEXT NOT NULL,
  pedido_id INTEGER REFERENCES pedidos(id),
  fatura_id INTEGER REFERENCES faturas(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

${SQL_MARCAS}

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

-- Atendimento (SAC): chat entre o cliente e o admin. Uma conversa por pedido
-- (pedido_id) e uma conversa geral do cliente (pedido_id NULL). Ninguém edita
-- mensagens (o banco recusa); só o admin apaga, e cada exclusão fica registrada
-- em atendimento_exclusoes. Imagem anexada: colunas imagem_* (arquivo em data/arquivos).
CREATE TABLE IF NOT EXISTS atendimento_mensagens (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES usuarios(id),
  pedido_id INTEGER REFERENCES pedidos(id),
  autor_id INTEGER NOT NULL REFERENCES usuarios(id),
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_atendimento_conversa ON atendimento_mensagens(cliente_id, pedido_id, id);
CREATE TRIGGER IF NOT EXISTS atendimento_sem_edicao BEFORE UPDATE ON atendimento_mensagens
BEGIN SELECT RAISE(ABORT, 'Mensagens do atendimento não podem ser alteradas.'); END;
CREATE TABLE IF NOT EXISTS atendimento_exclusoes (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES usuarios(id),
  cliente_id INTEGER NOT NULL,
  pedido_id INTEGER,
  quantidade INTEGER NOT NULL, -- mensagens apagadas
  conversa_inteira INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Limite de tentativas (login e recuperação de senha): falhas por chave ("email:..." ou
-- "ip:...") numa janela de tempo; passou do limite, fica bloqueado por um tempo.
CREATE TABLE IF NOT EXISTS limites_tentativas (
  chave TEXT PRIMARY KEY,
  falhas INTEGER NOT NULL DEFAULT 0,
  janela_desde TEXT NOT NULL DEFAULT (datetime('now')),
  bloqueado_ate TEXT
);
-- Recuperação de senha: link de uso único, válido por pouco tempo. Só o resumo (hash)
-- do código fica no banco, como nas sessões.
CREATE TABLE IF NOT EXISTS senha_tokens (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL,
  usado_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_senha_tokens_usuario ON senha_tokens(usuario_id, criado_em);
-- E-mails a enviar (fila). Gravados na mesma transação do aviso; enviados em segundo plano.
CREATE TABLE IF NOT EXISTS emails_fila (
  id INTEGER PRIMARY KEY,
  para TEXT NOT NULL,
  assunto TEXT NOT NULL,
  texto TEXT NOT NULL,
  html TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','falhou')),
  tentativas INTEGER NOT NULL DEFAULT 0,
  proxima_tentativa TEXT,
  erro TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  enviado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_emails_fila_status ON emails_fila(status, proxima_tentativa);
-- Contador de acessos (admin): páginas vistas no site e na área do cliente, com um
-- código de visitante anônimo que muda todo dia (sem IP), e os logins.
CREATE TABLE IF NOT EXISTS acessos_visitas (
  id INTEGER PRIMARY KEY,
  dia TEXT NOT NULL, -- AAAA-MM-DD, fuso de Brasília
  area TEXT NOT NULL CHECK (area IN ('site','cliente')),
  caminho TEXT NOT NULL,
  visitante TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_acessos_visitas_dia ON acessos_visitas(dia);
CREATE INDEX IF NOT EXISTS idx_acessos_visitas_visitante ON acessos_visitas(visitante, caminho, criado_em);
CREATE TABLE IF NOT EXISTS acessos_logins (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  papel TEXT NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('site','cadastro','app')),
  dia TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_acessos_logins_dia ON acessos_logins(dia);
-- Até qual mensagem cada pessoa já leu, por conversa (pedido 0 = conversa geral).
CREATE TABLE IF NOT EXISTS atendimento_leituras (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id INTEGER NOT NULL,
  pedido_chave INTEGER NOT NULL,
  ultima_lida INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, cliente_id, pedido_chave)
);
-- Telegram (out/2026): admins que recebem e respondem o atendimento pelo bot.
CREATE TABLE IF NOT EXISTS telegram_destinos (
  chat_id TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Código de uso único para ligar a conta (link t.me/bot?start=código); só o hash fica aqui.
CREATE TABLE IF NOT EXISTS telegram_codigos (
  hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL
);
-- Cada mensagem que o bot mandou, para saber a qual conversa uma resposta pertence.
CREATE TABLE IF NOT EXISTS telegram_mensagens (
  chat_id TEXT NOT NULL,
  msg_id INTEGER NOT NULL,
  cliente_id INTEGER NOT NULL,
  pedido_id INTEGER,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, msg_id)
);
-- Aceite dos Termos de Uso (out/2026): versão aceita, quando e de onde (prova da contratação).
CREATE TABLE IF NOT EXISTS termos_aceites (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  versao INTEGER NOT NULL,
  ip TEXT,
  navegador TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Quem somos (out/2026): perfis de colaboradores-chave mostrados no site.
-- Mídias em data/arquivos/perfis (só o nome do arquivo fica aqui); vídeos opcionais.
CREATE TABLE IF NOT EXISTS perfis (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  funcao TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  foto TEXT,
  video_16x9 TEXT,
  video_9x16 TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  visivel INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

type GlobalDb = typeof globalThis & { __dkDb?: DatabaseSync };

function abrir(): DatabaseSync {
  fs.mkdirSync(PASTA_ARQUIVOS, { recursive: true });
  const db = new DatabaseSync(path.join(PASTA_DADOS, "dark-kitchen.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  migrar(db);
  return db;
}

/** Conexão única, reaproveitada entre recarregamentos do modo de desenvolvimento. */
export function db(): DatabaseSync {
  const g = globalThis as GlobalDb;
  if (!g.__dkDb) g.__dkDb = abrir();
  return g.__dkDb;
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

/** Ajustes em bancos criados por versões anteriores. Cada passo pode rodar mais de uma vez. */
function migrar(d: DatabaseSync) {
  const colunas = (tabela: string) =>
    (d.prepare(`PRAGMA table_info(${tabela})`).all() as { name: string }[]).map((c) => c.name);

  if (!colunas("usuarios").includes("ativo")) d.exec("ALTER TABLE usuarios ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1");
  // Gerente de projetos foi fundido ao diretor de arte (out/2026).
  d.exec("UPDATE usuarios SET papel = 'diretor' WHERE papel = 'gerente'");

  // Várias marcas por cliente (out/2026): a antiga marca única vira a primeira marca da lista.
  if (!colunas("marcas").includes("id")) {
    d.exec(`
      BEGIN;
      ALTER TABLE marcas RENAME TO marcas_antiga;
      ${SQL_MARCAS}
      INSERT INTO marcas (usuario_id, nome, cores, observacoes, atualizado_em)
        SELECT m.usuario_id, COALESCE(NULLIF(u.empresa, ''), 'Minha marca'), m.cores, m.observacoes, m.atualizado_em
        FROM marcas_antiga m JOIN usuarios u ON u.id = m.usuario_id;
      DROP TABLE marcas_antiga;
      COMMIT;`);
  }
  // Todo cliente tem pelo menos uma marca.
  d.exec(`INSERT INTO marcas (usuario_id, nome)
    SELECT u.id, COALESCE(NULLIF(u.empresa, ''), 'Minha marca') FROM usuarios u
    WHERE u.papel = 'cliente' AND NOT EXISTS (SELECT 1 FROM marcas m WHERE m.usuario_id = u.id)`);
  const primeiraMarca = "(SELECT m.id FROM marcas m WHERE m.usuario_id = %s ORDER BY m.id LIMIT 1)";
  if (!colunas("arquivos").includes("marca_id")) {
    d.exec("ALTER TABLE arquivos ADD COLUMN marca_id INTEGER REFERENCES marcas(id)");
    d.exec(`UPDATE arquivos SET marca_id = ${primeiraMarca.replace("%s", "arquivos.dono_id")} WHERE categoria IN ('logo','manual')`);
  }
  if (!colunas("pedidos").includes("marca_id")) {
    d.exec("ALTER TABLE pedidos ADD COLUMN marca_id INTEGER REFERENCES marcas(id)");
    d.exec(`UPDATE pedidos SET marca_id = ${primeiraMarca.replace("%s", "pedidos.cliente_id")}`);
  }
  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_marcas_usuario ON marcas(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_arquivos_marca ON arquivos(marca_id);`);

  // Configurações editáveis pelo admin (tabela de preços) e o histórico de alterações (out/2026).
  d.exec(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_por INTEGER REFERENCES usuarios(id)
    );
    CREATE TABLE IF NOT EXISTS configuracoes_historico (
      id INTEGER PRIMARY KEY,
      chave TEXT NOT NULL,
      valor TEXT NOT NULL,
      autor_id INTEGER REFERENCES usuarios(id),
      resumo TEXT NOT NULL DEFAULT '',
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );`);
  // Troca para um plano menor fica agendada para a próxima renovação (out/2026).
  if (!colunas("assinaturas").includes("plano_proximo")) d.exec("ALTER TABLE assinaturas ADD COLUMN plano_proximo TEXT");
  // Renovação automática (o cliente pode desligar), cobrança recusada com carência e
  // aviso de créditos expirando (out/2026).
  const colAssinatura = colunas("assinaturas");
  const novasColunas: [string, string][] = [
    ["renovacao_automatica", "INTEGER NOT NULL DEFAULT 1"],
    ["inadimplente_desde", "TEXT"], // cobrança da renovação recusada desde esta data
    ["tentativas_cobranca", "INTEGER NOT NULL DEFAULT 0"],
    ["proxima_tentativa", "TEXT"],
    ["aviso_expiracao", "TEXT"], // fim de período para o qual o aviso de expiração já foi enviado
    // Plano Personalizado: valores combinados com o cliente (plano_id = 'personalizado').
    ["personalizado_preco", "REAL"],
    ["personalizado_creditos", "INTEGER"],
  ];
  for (const [nome, tipo] of novasColunas)
    if (!colAssinatura.includes(nome)) d.exec(`ALTER TABLE assinaturas ADD COLUMN ${nome} ${tipo}`);
  // E-mails (out/2026): o que cada pessoa quer receber ("todos", "importantes" ou "nenhum").
  if (!colunas("usuarios").includes("email_avisos"))
    d.exec("ALTER TABLE usuarios ADD COLUMN email_avisos TEXT NOT NULL DEFAULT 'todos'");
  // Pix (out/2026): assinatura "pendente" (aguardando o 1º pagamento ou a negociação do
  // plano Personalizado) e fatura "cancelada". O SQLite não altera CHECK: a tabela é
  // recriada com a regra nova e os mesmos dados (as colunas novas ficam no fim).
  const ampliarCheck = (tabela: string, antigo: string, novo: string) => {
    const sql = (d.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabela) as { sql: string }).sql;
    if (!sql.includes(antigo)) return;
    const nova = sql.replace(antigo, novo).replace(/^CREATE TABLE (IF NOT EXISTS )?("?)[A-Za-z_]+\2/, `CREATE TABLE ${tabela}_nova`);
    if (!nova.startsWith(`CREATE TABLE ${tabela}_nova`)) throw new Error(`Migração: não consegui recriar a tabela ${tabela}.`);
    d.exec("PRAGMA foreign_keys = OFF; BEGIN");
    try {
      d.exec(`${nova}; INSERT INTO ${tabela}_nova SELECT * FROM ${tabela}; DROP TABLE ${tabela};
        ALTER TABLE ${tabela}_nova RENAME TO ${tabela};`);
      d.exec("COMMIT");
    } catch (e) {
      d.exec("ROLLBACK"); // nada muda se algo der errado
      throw e;
    } finally {
      d.exec("PRAGMA foreign_keys = ON");
    }
  };
  ampliarCheck("assinaturas", "CHECK (status IN ('ativa','cancelada'))", "CHECK (status IN ('ativa','cancelada','pendente'))");
  ampliarCheck("faturas", "CHECK (status IN ('paga','pendente','falhou'))", "CHECK (status IN ('paga','pendente','falhou','cancelada'))");
  const colFatura = colunas("faturas");
  for (const [nome, tipo] of [
    ["pix_payload", "TEXT"], // código Pix copia e cola (o QR Code é gerado dele)
    ["vence_em", "TEXT"],
    ["acao", "TEXT"], // JSON: o que liberar quando o pagamento for confirmado
    ["confirmada_em", "TEXT"],
    ["confirmada_por", "INTEGER REFERENCES usuarios(id)"],
    ["aviso_pago_em", "TEXT"], // cliente avisou que pagou
  ])
    if (!colFatura.includes(nome)) d.exec(`ALTER TABLE faturas ADD COLUMN ${nome} ${tipo}`);
  d.exec("CREATE INDEX IF NOT EXISTS idx_faturas_status ON faturas(status)");
  // Atendimento (out/2026): o admin passa a poder apagar mensagens e conversas, e
  // as mensagens podem levar uma imagem.
  d.exec("DROP TRIGGER IF EXISTS atendimento_sem_exclusao");
  const colMsg = colunas("atendimento_mensagens");
  for (const [nome, tipo] of [
    ["imagem_caminho", "TEXT"],
    ["imagem_nome", "TEXT"],
    ["imagem_mime", "TEXT"],
    ["imagem_tamanho", "INTEGER"],
  ])
    if (!colMsg.includes(nome)) d.exec(`ALTER TABLE atendimento_mensagens ADD COLUMN ${nome} ${tipo}`);
  // CPF ou CNPJ de quem contrata (out/2026): só letras e números; um por conta.
  if (!colunas("usuarios").includes("documento")) d.exec("ALTER TABLE usuarios ADD COLUMN documento TEXT");
  d.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_documento ON usuarios(documento) WHERE documento IS NOT NULL");
  // Registro de acesso (Marco Civil, art. 15): IP de cada login, guardado por pelo menos 6 meses.
  if (!colunas("acessos_logins").includes("ip")) d.exec("ALTER TABLE acessos_logins ADD COLUMN ip TEXT");
  // Quem somos: título de cada vídeo do perfil (out/2026).
  for (const col of ["titulo_16x9", "titulo_9x16"])
    if (!colunas("perfis").includes(col)) d.exec(`ALTER TABLE perfis ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
  // Reativação de pedido concluído ou cancelado (out/2026): quantas vezes, para o selo "Reativado".
  if (!colunas("pedidos").includes("reativacoes")) d.exec("ALTER TABLE pedidos ADD COLUMN reativacoes INTEGER NOT NULL DEFAULT 0");
  // Créditos passam a expirar: o extrato ganha o tipo "expiracao". O SQLite não altera
  // a regra (CHECK) de uma tabela, então ela é recriada com os mesmos lançamentos.
  const sqlCreditos = (d.prepare("SELECT sql FROM sqlite_master WHERE name = 'creditos'").get() as { sql: string }).sql;
  if (!sqlCreditos.includes("'expiracao'")) {
    d.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      CREATE TABLE creditos_nova (
        id INTEGER PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        quantidade INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('assinatura','compra','pedido','revisao_extra','estorno','ajuste','expiracao')),
        descricao TEXT NOT NULL,
        pedido_id INTEGER REFERENCES pedidos(id),
        fatura_id INTEGER REFERENCES faturas(id),
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO creditos_nova SELECT id, usuario_id, quantidade, tipo, descricao, pedido_id, fatura_id, criado_em FROM creditos;
      DROP TABLE creditos;
      ALTER TABLE creditos_nova RENAME TO creditos;
      CREATE INDEX IF NOT EXISTS idx_creditos_usuario ON creditos(usuario_id);
      COMMIT;
      PRAGMA foreign_keys = ON;`);
  }
  // Códigos de pedido passaram de "Q-" (nome antigo) para "DK-" (Dark Kitchen), out/2026.
  // Converte o código e as menções a ele em notificações, extrato e comentários.
  const antigos = d.prepare("SELECT id, codigo FROM pedidos WHERE codigo LIKE 'Q-%' ORDER BY length(codigo) DESC").all() as {
    id: number;
    codigo: string;
  }[];
  if (antigos.length) {
    d.exec("BEGIN");
    try {
      for (const { id, codigo } of antigos) {
        const novo = "DK-" + codigo.slice(2);
        d.prepare("UPDATE pedidos SET codigo = ? WHERE id = ?").run(novo, id);
        d.prepare("UPDATE notificacoes SET texto = REPLACE(texto, ?, ?) WHERE texto LIKE ?").run(codigo, novo, `%${codigo}%`);
        d.prepare("UPDATE creditos SET descricao = REPLACE(descricao, ?, ?) WHERE descricao LIKE ?").run(codigo, novo, `%${codigo}%`);
        d.prepare("UPDATE comentarios SET texto = REPLACE(texto, ?, ?) WHERE texto LIKE ?").run(codigo, novo, `%${codigo}%`);
      }
      d.exec("COMMIT");
    } catch (e) {
      d.exec("ROLLBACK");
      throw e;
    }
  }
  // Cada pedido guarda o detalhamento dos créditos cobrados, para não mudar se os preços mudarem.
  if (!colunas("pedidos").includes("creditos_detalhe"))
    d.exec("ALTER TABLE pedidos ADD COLUMN creditos_detalhe TEXT");
}
