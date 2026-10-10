import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ErroNegocio, PASTA_ARQUIVOS, executar, transacao, um, varios } from "../db";
import type { Usuario } from "../auth";

// Quem somos (out/2026): perfis de colaboradores-chave no site (foto, nome, função,
// bio e vídeos 16:9 e/ou 9:16). Só o admin gerencia. As mídias ficam em
// data/arquivos/perfis, com nome único (UUID): o endereço nunca muda de conteúdo.

export const PASTA_PERFIS = path.join(PASTA_ARQUIVOS, "perfis");

export interface Perfil {
  id: number;
  nome: string;
  funcao: string;
  bio: string;
  foto: string | null;
  video_16x9: string | null;
  video_9x16: string | null;
  ordem: number;
  visivel: number;
}

export type TipoMidia = "foto" | "video_16x9" | "video_9x16";
export const TIPOS_MIDIA: TipoMidia[] = ["foto", "video_16x9", "video_9x16"];

const LIMITE_MB: Record<TipoMidia, number> = { foto: 10, video_16x9: 1500, video_9x16: 1500 };

/** Endereço público de uma mídia do perfil. */
export const urlMidia = (nome: string) => `/api/v1/perfis/midia/${nome}`;

const exigirAdmin = (u: Usuario) => {
  if (u.papel !== "admin") throw new ErroNegocio("Somente o administrador gerencia o Quem somos.", 403);
};

export const perfisVisiveis = () => varios<Perfil>("SELECT * FROM perfis WHERE visivel = 1 ORDER BY ordem, id");

export const todosOsPerfis = () => varios<Perfil>("SELECT * FROM perfis ORDER BY ordem, id");

const perfil = (id: number) => {
  const p = um<Perfil>("SELECT * FROM perfis WHERE id = ?", id);
  if (!p) throw new ErroNegocio("Perfil não encontrado.", 404);
  return p;
};

function limparCampos(dados: { nome: string; funcao: string; bio: string }) {
  const nome = dados.nome.trim().slice(0, 80);
  if (nome.length < 2) throw new ErroNegocio("Informe o nome.");
  return { nome, funcao: dados.funcao.trim().slice(0, 80), bio: dados.bio.trim().slice(0, 4000) };
}

export function criarPerfil(admin: Usuario, dados: { nome: string; funcao: string; bio: string }) {
  exigirAdmin(admin);
  const c = limparCampos(dados);
  const ordem = (um<{ m: number }>("SELECT COALESCE(MAX(ordem), 0) m FROM perfis")?.m ?? 0) + 1;
  return executar("INSERT INTO perfis (nome, funcao, bio, ordem) VALUES (?, ?, ?, ?)", c.nome, c.funcao, c.bio, ordem).id;
}

export function salvarPerfil(admin: Usuario, id: number, dados: { nome: string; funcao: string; bio: string; visivel: boolean }) {
  exigirAdmin(admin);
  perfil(id);
  const c = limparCampos(dados);
  executar(
    "UPDATE perfis SET nome = ?, funcao = ?, bio = ?, visivel = ?, atualizado_em = datetime('now') WHERE id = ?",
    c.nome,
    c.funcao,
    c.bio,
    dados.visivel ? 1 : 0,
    id,
  );
}

/** Troca a posição com o vizinho de cima (-1) ou de baixo (+1). */
export function moverPerfil(admin: Usuario, id: number, direcao: -1 | 1) {
  exigirAdmin(admin);
  const lista = todosOsPerfis();
  const i = lista.findIndex((p) => p.id === id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= lista.length) return;
  const ordem = lista.map((p) => p.id);
  [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  transacao(() => ordem.forEach((pid, k) => executar("UPDATE perfis SET ordem = ? WHERE id = ?", k + 1, pid)));
}

const apagarArquivo = (nome: string | null) => {
  if (nome) fs.rmSync(path.join(PASTA_PERFIS, path.basename(nome)), { force: true });
};

export function removerPerfil(admin: Usuario, id: number) {
  exigirAdmin(admin);
  const p = perfil(id);
  executar("DELETE FROM perfis WHERE id = ?", id);
  for (const t of TIPOS_MIDIA) apagarArquivo(p[t]);
}

export function removerMidia(admin: Usuario, id: number, tipo: TipoMidia) {
  exigirAdmin(admin);
  const p = perfil(id);
  executar(`UPDATE perfis SET ${tipo} = NULL, atualizado_em = datetime('now') WHERE id = ?`, id);
  apagarArquivo(p[tipo]);
}

/** Tipo do arquivo pelos primeiros bytes (não confia no nome nem no que o navegador diz). */
function detectar(cabeca: Buffer, tipo: TipoMidia): { ext: string } | null {
  if (tipo === "foto") {
    if (cabeca[0] === 0xff && cabeca[1] === 0xd8 && cabeca[2] === 0xff) return { ext: "jpg" };
    if (cabeca.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png" };
    if (cabeca.toString("latin1", 0, 4) === "RIFF" && cabeca.toString("latin1", 8, 12) === "WEBP") return { ext: "webp" };
    return null;
  }
  if (cabeca.toString("latin1", 4, 8) === "ftyp") return { ext: cabeca.toString("latin1", 8, 10) === "qt" ? "mov" : "mp4" };
  if (cabeca.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { ext: "webm" };
  return null;
}

export const MIME_MIDIA: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/**
 * Grava uma mídia enviada (corpo da requisição, em fluxo: vídeos grandes não passam
 * pela memória). Substitui a anterior do mesmo tipo e apaga o arquivo antigo.
 */
export async function salvarMidia(admin: Usuario, id: number, tipo: TipoMidia, corpo: ReadableStream<Uint8Array> | null) {
  exigirAdmin(admin);
  perfil(id);
  if (!TIPOS_MIDIA.includes(tipo)) throw new ErroNegocio("Tipo de mídia inválido.");
  if (!corpo) throw new ErroNegocio("Nenhum arquivo enviado.");
  fs.mkdirSync(PASTA_PERFIS, { recursive: true });
  const limite = LIMITE_MB[tipo] * 1024 * 1024;
  const temporario = path.join(PASTA_PERFIS, `${crypto.randomUUID()}.parcial`);
  const saida = fs.createWriteStream(temporario);
  let total = 0;
  let cabeca = Buffer.alloc(0);
  try {
    for await (const pedaco of corpo as unknown as AsyncIterable<Uint8Array>) {
      total += pedaco.length;
      if (total > limite) throw new ErroNegocio(`O arquivo passa do limite de ${LIMITE_MB[tipo]} MB.`);
      if (cabeca.length < 16) cabeca = Buffer.concat([cabeca, Buffer.from(pedaco.subarray(0, 16))]);
      if (!saida.write(pedaco)) await new Promise<void>((r) => saida.once("drain", () => r()));
    }
    await new Promise<void>((ok, erro) => saida.end((e?: Error | null) => (e ? erro(e) : ok())));
    if (total === 0) throw new ErroNegocio("O arquivo está vazio.");
    const t = detectar(cabeca, tipo);
    if (!t)
      throw new ErroNegocio(tipo === "foto" ? "Envie a foto em JPG, PNG ou WebP." : "Envie o vídeo em MP4 (ou MOV/WebM).");
    const nome = `${crypto.randomUUID()}.${t.ext}`;
    fs.renameSync(temporario, path.join(PASTA_PERFIS, nome));
    const anterior = perfil(id)[tipo];
    executar(`UPDATE perfis SET ${tipo} = ?, atualizado_em = datetime('now') WHERE id = ?`, nome, id);
    apagarArquivo(anterior);
    return nome;
  } catch (e) {
    saida.destroy();
    fs.rmSync(temporario, { force: true });
    throw e;
  }
}

/** Caminho de uma mídia pública: só nomes gerados aqui e que algum perfil usa. */
export function midiaPublica(nome: string): { caminho: string; mime: string } | null {
  const m = nome.match(/^[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov|webm)$/);
  if (!m) return null;
  const usado = um("SELECT 1 FROM perfis WHERE foto = ? OR video_16x9 = ? OR video_9x16 = ?", nome, nome, nome);
  if (!usado) return null;
  return { caminho: path.join(PASTA_PERFIS, nome), mime: MIME_MIDIA[m[1]] };
}
