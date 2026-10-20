import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ehEquipe } from "@/domain/pedido";
import { ErroNegocio, PASTA_ARQUIVOS, executar, um, varios } from "../db";
import type { Usuario } from "../auth";

// Arquivos ficam em disco (data/arquivos). No servidor online, trocar por um
// armazenamento de objetos (S3, R2) mudando só salvar() e caminhoAbsoluto().

export type Categoria = "logo" | "manual" | "foto" | "video" | "versao" | "entrega" | "anexo";

export interface Arquivo {
  id: number;
  dono_id: number;
  pedido_id: number | null;
  versao_id: number | null;
  marca_id: number | null;
  categoria: Categoria;
  nome: string;
  caminho: string;
  mime: string;
  tamanho: number;
  criado_em: string;
}

// Limite só nos envios da equipe. O que o cliente envia (logo, manual, fotos, vídeos)
// não tem limite de tamanho (decisão out/2026); por isso o envio é gravado em fluxo.
const LIMITE_MB: Partial<Record<Categoria, number>> = {
  versao: 500,
  entrega: 2000,
};

const CATEGORIAS: Categoria[] = ["logo", "manual", "foto", "video", "versao", "entrega", "anexo"];
const CATEGORIAS_CLIENTE: Categoria[] = ["logo", "manual", "foto", "video", "anexo"];

/** Arquivo recebido: o File de um formulário (multipart) ou o corpo da requisição em fluxo. */
export interface Envio {
  nome: string;
  mime: string;
  corpo: ReadableStream<Uint8Array> | null;
}

export const envioDeFile = (f: File): Envio => ({ nome: f.name, mime: f.type, corpo: f.stream() });

export async function salvarArquivo(
  usuario: Usuario,
  arquivo: Envio,
  categoria: Categoria,
  pedidoId?: number | null,
  marcaId?: number | null,
): Promise<Arquivo> {
  if (!CATEGORIAS.includes(categoria)) throw new ErroNegocio("Categoria de arquivo inválida.");
  // Logo e manual pertencem a uma marca do próprio cliente.
  const ehDaMarca = categoria === "logo" || categoria === "manual";
  if (ehDaMarca && !marcaId) throw new ErroNegocio("Escolha a marca deste arquivo.");
  if (ehDaMarca && !um("SELECT 1 FROM marcas WHERE id = ? AND usuario_id = ?", marcaId!, usuario.id))
    throw new ErroNegocio("Marca não encontrada.", 404);
  if (!ehEquipe(usuario.papel) && !CATEGORIAS_CLIENTE.includes(categoria))
    throw new ErroNegocio("Você não pode enviar esse tipo de arquivo.", 403);
  if (!arquivo.corpo) throw new ErroNegocio("Nenhum arquivo enviado.");

  const ext = path.extname(arquivo.nome).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const relativo = path.join(new Date().toISOString().slice(0, 7), `${crypto.randomUUID()}${ext}`);
  const destino = path.join(PASTA_ARQUIVOS, relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });

  // Grava em fluxo (arquivos grandes não passam pela memória); no erro, apaga o que já foi gravado.
  const limiteMb = LIMITE_MB[categoria];
  const saida = fs.createWriteStream(destino);
  let tamanho = 0;
  try {
    for await (const pedaco of arquivo.corpo as unknown as AsyncIterable<Uint8Array>) {
      tamanho += pedaco.length;
      if (limiteMb && tamanho > limiteMb * 1024 * 1024) throw new ErroNegocio(`O arquivo passa do limite de ${limiteMb} MB.`);
      if (!saida.write(pedaco)) await new Promise<void>((r) => saida.once("drain", () => r()));
    }
    await new Promise<void>((ok, erro) => saida.end((e?: Error | null) => (e ? erro(e) : ok())));
    if (tamanho === 0) throw new ErroNegocio("O arquivo está vazio.");
  } catch (e) {
    saida.destroy();
    fs.rmSync(destino, { force: true });
    throw e;
  }

  const nome = path.basename(arquivo.nome).slice(0, 180) || "arquivo";
  const id = executar(
    "INSERT INTO arquivos (dono_id, pedido_id, marca_id, categoria, nome, caminho, mime, tamanho) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    usuario.id,
    pedidoId ?? null,
    ehDaMarca ? marcaId! : null,
    categoria,
    nome,
    relativo,
    arquivo.mime || "application/octet-stream",
    tamanho,
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

export function arquivosPorIds(ids: number[]): Arquivo[] {
  const limpos = ids.filter((n) => Number.isInteger(n));
  if (!limpos.length) return [];
  return varios<Arquivo>(`SELECT * FROM arquivos WHERE id IN (${limpos.map(() => "?").join(",")})`, ...limpos);
}

export function removerArquivoDaMarca(usuario: Usuario, id: number) {
  const a = um<Arquivo>("SELECT * FROM arquivos WHERE id = ? AND dono_id = ?", id, usuario.id);
  if (!a || !["logo", "manual"].includes(a.categoria)) throw new ErroNegocio("Arquivo não encontrado.", 404);
  // Mantém o arquivo em disco: pedidos antigos ainda podem referenciá-lo.
  executar("UPDATE arquivos SET categoria = 'anexo', marca_id = NULL WHERE id = ?", id);
}

