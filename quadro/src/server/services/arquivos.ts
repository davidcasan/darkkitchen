import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ehEquipe } from "@/domain/pedido";
import { ErroNegocio, PASTA_ARQUIVOS, executar, um, varios } from "../db";
import type { Usuario } from "../auth";

// Arquivos ficam em disco (data/arquivos). No servidor online, trocar por um
// armazenamento de objetos (S3, R2) mudando só salvar() e caminhoAbsoluto().

export type Categoria = "logo" | "manual" | "foto" | "versao" | "entrega" | "anexo";

export interface Arquivo {
  id: number;
  dono_id: number;
  pedido_id: number | null;
  versao_id: number | null;
  categoria: Categoria;
  nome: string;
  caminho: string;
  mime: string;
  tamanho: number;
  criado_em: string;
}

const LIMITE_MB: Record<Categoria, number> = {
  logo: 50,
  manual: 100,
  foto: 50,
  versao: 500,
  entrega: 2000,
  anexo: 100,
};

const CATEGORIAS_CLIENTE: Categoria[] = ["logo", "manual", "foto", "anexo"];

export async function salvarArquivo(
  usuario: Usuario,
  arquivo: File,
  categoria: Categoria,
  pedidoId?: number | null,
): Promise<Arquivo> {
  if (!LIMITE_MB[categoria]) throw new ErroNegocio("Categoria de arquivo inválida.");
  if (!ehEquipe(usuario.papel) && !CATEGORIAS_CLIENTE.includes(categoria))
    throw new ErroNegocio("Você não pode enviar esse tipo de arquivo.", 403);
  if (arquivo.size === 0) throw new ErroNegocio("O arquivo está vazio.");
  if (arquivo.size > LIMITE_MB[categoria] * 1024 * 1024)
    throw new ErroNegocio(`O arquivo passa do limite de ${LIMITE_MB[categoria]} MB.`);

  const ext = path.extname(arquivo.name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const relativo = path.join(new Date().toISOString().slice(0, 7), `${crypto.randomUUID()}${ext}`);
  const destino = path.join(PASTA_ARQUIVOS, relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, Buffer.from(await arquivo.arrayBuffer()));

  const nome = path.basename(arquivo.name).slice(0, 180) || "arquivo";
  const id = executar(
    "INSERT INTO arquivos (dono_id, pedido_id, categoria, nome, caminho, mime, tamanho) VALUES (?, ?, ?, ?, ?, ?, ?)",
    usuario.id,
    pedidoId ?? null,
    categoria,
    nome,
    relativo,
    arquivo.type || "application/octet-stream",
    arquivo.size,
  ).id;
  return um<Arquivo>("SELECT * FROM arquivos WHERE id = ?", id)!;
}

export const caminhoAbsoluto = (a: Arquivo) => path.join(PASTA_ARQUIVOS, a.caminho);

/**
 * Regras de acesso: a equipe vê tudo; o cliente vê o que enviou e o que foi
 * entregue nos pedidos dele (somente versões já liberadas para ele).
 */
export function arquivoParaUsuario(id: number, usuario: Usuario): Arquivo {
  const a = um<Arquivo>("SELECT * FROM arquivos WHERE id = ?", id);
  if (!a) throw new ErroNegocio("Arquivo não encontrado.", 404);
  if (ehEquipe(usuario.papel) || a.dono_id === usuario.id) return a;
  const liberado = um(
    `SELECT 1 FROM arquivos a
     JOIN pedidos p ON p.id = a.pedido_id
     LEFT JOIN versoes v ON v.id = a.versao_id
     WHERE a.id = ? AND p.cliente_id = ?
       AND (a.versao_id IS NULL OR v.status IN ('com_cliente','ajuste','aprovada','rejeitada'))`,
    id,
    usuario.id,
  );
  if (!liberado) throw new ErroNegocio("Arquivo não encontrado.", 404);
  return a;
}

/** Arquivos da marca salvos no perfil (logo e manual enviados pelo cliente). */
export const arquivosDaMarca = (clienteId: number) =>
  varios<Arquivo>(
    "SELECT * FROM arquivos WHERE dono_id = ? AND categoria IN ('logo','manual') ORDER BY id DESC",
    clienteId,
  );

export function arquivosPorIds(ids: number[]): Arquivo[] {
  const limpos = ids.filter((n) => Number.isInteger(n));
  if (!limpos.length) return [];
  return varios<Arquivo>(`SELECT * FROM arquivos WHERE id IN (${limpos.map(() => "?").join(",")})`, ...limpos);
}

export function removerArquivoDaMarca(usuario: Usuario, id: number) {
  const a = um<Arquivo>("SELECT * FROM arquivos WHERE id = ? AND dono_id = ?", id, usuario.id);
  if (!a || !["logo", "manual"].includes(a.categoria)) throw new ErroNegocio("Arquivo não encontrado.", 404);
  // Mantém o arquivo em disco: pedidos antigos ainda podem referenciá-lo.
  executar("UPDATE arquivos SET categoria = 'anexo' WHERE id = ?", id);
}

