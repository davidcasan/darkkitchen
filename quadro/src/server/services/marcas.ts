import "server-only";
import { ErroNegocio, executar, transacao, um, varios } from "../db";
import type { Usuario } from "../auth";
import type { Arquivo } from "./arquivos";

// Marcas do cliente. Cada marca guarda seus próprios assets (logo, manual,
// cores, observações), reaproveitados nos pedidos seguintes da mesma marca.

export interface Marca {
  id: number;
  usuario_id: number;
  nome: string;
  cores: string[];
  observacoes: string;
  criado_em: string;
  pedidos: number;
}

export interface MarcaComArquivos extends Marca {
  arquivos: Pick<Arquivo, "id" | "nome" | "categoria" | "tamanho">[];
}

type LinhaMarca = Omit<Marca, "cores"> & { cores: string };

const SELECT_MARCA = `
  SELECT m.id, m.usuario_id, m.nome, m.cores, m.observacoes, m.criado_em,
    (SELECT COUNT(*) FROM pedidos p WHERE p.marca_id = m.id) pedidos
  FROM marcas m`;

const converter = (m: LinhaMarca): Marca => ({ ...m, cores: JSON.parse(m.cores) as string[] });

const arquivosDe = (marcaId: number) =>
  varios<Pick<Arquivo, "id" | "nome" | "categoria" | "tamanho">>(
    "SELECT id, nome, categoria, tamanho FROM arquivos WHERE marca_id = ? AND categoria IN ('logo','manual') ORDER BY id DESC",
    marcaId,
  );

export function listarMarcas(clienteId: number): MarcaComArquivos[] {
  return varios<LinhaMarca>(`${SELECT_MARCA} WHERE m.usuario_id = ? ORDER BY m.id`, clienteId).map((m) => ({
    ...converter(m),
    arquivos: arquivosDe(m.id),
  }));
}

/** Busca a marca garantindo que é do cliente (a equipe pode ver qualquer uma). */
export function marcaParaUsuario(id: number, usuario: Usuario): MarcaComArquivos {
  const m = um<LinhaMarca>(`${SELECT_MARCA} WHERE m.id = ?`, id);
  if (!m || (usuario.papel === "cliente" && m.usuario_id !== usuario.id)) throw new ErroNegocio("Marca não encontrada.", 404);
  return { ...converter(m), arquivos: arquivosDe(m.id) };
}

const nomeValido = (nome: string) => {
  const n = nome.trim().slice(0, 80);
  if (n.length < 2) throw new ErroNegocio("Dê um nome para a marca.");
  return n;
};

export function criarMarca(clienteId: number, nome: string, cores: string[] = []): number {
  const n = nomeValido(nome);
  if (um("SELECT 1 FROM marcas WHERE usuario_id = ? AND nome = ? COLLATE NOCASE", clienteId, n))
    throw new ErroNegocio("Você já tem uma marca com esse nome.");
  return executar("INSERT INTO marcas (usuario_id, nome, cores) VALUES (?, ?, ?)", clienteId, n, JSON.stringify(cores)).id;
}

export function atualizarMarca(
  usuario: Usuario,
  id: number,
  dados: { nome?: string; cores?: string[]; observacoes?: string },
) {
  const m = marcaParaUsuario(id, usuario);
  const nome = dados.nome === undefined ? m.nome : nomeValido(dados.nome);
  if (nome.toLowerCase() !== m.nome.toLowerCase() && um("SELECT 1 FROM marcas WHERE usuario_id = ? AND nome = ? COLLATE NOCASE AND id != ?", m.usuario_id, nome, id))
    throw new ErroNegocio("Você já tem uma marca com esse nome.");
  const cores = (dados.cores ?? m.cores).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5);
  executar(
    "UPDATE marcas SET nome = ?, cores = ?, observacoes = ?, atualizado_em = datetime('now') WHERE id = ?",
    nome,
    JSON.stringify(cores),
    (dados.observacoes ?? m.observacoes).slice(0, 2000),
    id,
  );
}

/** Só remove marca sem pedidos, e nunca a última do cliente. */
export function removerMarca(usuario: Usuario, id: number) {
  const m = marcaParaUsuario(id, usuario);
  if (m.pedidos > 0) throw new ErroNegocio("Esta marca tem pedidos e não pode ser removida.");
  const total = um<{ n: number }>("SELECT COUNT(*) n FROM marcas WHERE usuario_id = ?", m.usuario_id)!.n;
  if (total <= 1) throw new ErroNegocio("O cliente precisa ter pelo menos uma marca.");
  transacao(() => {
    // Os arquivos ficam guardados (podem estar em pedidos antigos), só saem da marca.
    executar("UPDATE arquivos SET marca_id = NULL, categoria = 'anexo' WHERE marca_id = ?", id);
    executar("DELETE FROM marcas WHERE id = ?", id);
  });
}
