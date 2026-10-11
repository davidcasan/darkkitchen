import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { type Briefing, atualizarBriefing, objetivoTexto, pecaDo, revelacaoTexto, tonsTexto } from "@/domain/briefing";
import { ErroNegocio, PASTA_ARQUIVOS, executar, um, varios } from "../db";
import type { Usuario } from "../auth";
import { arquivosPorIds, caminhoAbsoluto } from "./arquivos";
import { criarZip } from "../zip";
import { SEM_EMAIL, notificar } from "./notificacoes";

// IA Comp (out/2026): ao chegar um pedido, a IA (Claude) sugere conceito, cenas com tempos,
// textos, paleta e trilha, e a plataforma monta um KIT para o After Effects (pedido.json,
// assets do cliente e o script montar-comp.jsx). Dois modos, escolhidos pelo admin:
//  - "kit": o designer baixa o kit e roda o script no After dele;
//  - "operaria": uma máquina com After (scripts/maquina-operaria.mjs) busca o kit pela API,
//    monta a composição sozinha e devolve o .aep e uma prévia.
// Tudo desligado por padrão: cada pedido com IA gasta créditos da API da Anthropic.
// Material interno da equipe: nunca é mostrado ao cliente.

export type ModoIaComp = "kit" | "operaria";
export interface ConfigIaComp {
  ativo: boolean;
  modo: ModoIaComp;
  usarIA: boolean;
}
const PADRAO: ConfigIaComp = { ativo: false, modo: "kit", usarIA: true };
export const MODELO_IA = "claude-opus-5-5";
// Preço por milhão de tokens (US$) do modelo acima, para a estimativa de gasto na tela do admin.
export const PRECO_MTOK = { entrada: 4, saida: 20 };

export const PASTA_IA = path.join(PASTA_ARQUIVOS, "ia-comp");
const SCRIPT_AE = path.join(process.cwd(), "ia-comp", "montar-comp.jsx");

export type StatusJob = "pendente" | "gerando" | "aguardando_maquina" | "na_maquina" | "pronto" | "erro";
export const ROTULO_STATUS: Record<StatusJob, string> = {
  pendente: "Na fila",
  gerando: "Gerando sugestões e kit",
  aguardando_maquina: "Aguardando a máquina operária",
  na_maquina: "Montando no After (máquina operária)",
  pronto: "Pronto",
  erro: "Erro",
};

export interface Sugestoes {
  conceito: string;
  linhas_criativas: { titulo: string; descricao: string }[];
  cenas: { inicio: number; fim: number; texto_tela: string; locucao: string; visual: string }[];
  paleta: { hex: string; uso: string }[];
  tipografia: string;
  ritmo: string;
  trilha: string;
  observacoes: string;
}

export interface JobIaComp {
  id: number;
  pedido_id: number;
  status: StatusJob;
  modo: ModoIaComp;
  usar_ia: number;
  sugestoes: string | null;
  modelo: string | null;
  tokens_entrada: number;
  tokens_saida: number;
  erro: string | null;
  maquina_desde: string | null;
  origem: "ia" | "chat";
  nota: string | null;
  especificacao: string | null;
  claude_status: "aguardando" | "criando" | null;
  claude_instrucoes: string | null;
  claude_pedido_em: string | null;
  claude_pedido_por: number | null;
  criado_em: string;
  atualizado_em: string;
}

export interface VersaoIaComp {
  id: number;
  job_id: number;
  origem: "ia" | "chat";
  nota: string | null;
  especificacao: string | null;
  sugestoes: string | null;
  modelo: string | null;
  tokens_entrada: number;
  tokens_saida: number;
  criado_em: string;
  arquivado_em: string;
}
export type TipoArquivoIaComp = "kit" | "aep" | "previa";
const NOME_ARQUIVO: Record<TipoArquivoIaComp, string> = { kit: "kit.zip", aep: "comp.zip", previa: "previa.png" };

// ---------- Configuração (admin) ----------

export function configIaComp(): ConfigIaComp {
  const l = um<{ valor: string }>("SELECT valor FROM configuracoes WHERE chave = 'ia_comp'");
  if (!l) return PADRAO;
  try {
    return { ...PADRAO, ...(JSON.parse(l.valor) as Partial<ConfigIaComp>) };
  } catch {
    return PADRAO;
  }
}

export function salvarConfigIaComp(admin: Usuario, c: ConfigIaComp) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador altera a IA Comp.", 403);
  const limpo: ConfigIaComp = { ativo: Boolean(c.ativo), modo: c.modo === "operaria" ? "operaria" : "kit", usarIA: Boolean(c.usarIA) };
  executar(
    `INSERT INTO configuracoes (chave, valor, atualizado_em, atualizado_por) VALUES ('ia_comp', ?, datetime('now'), ?)
     ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`,
    JSON.stringify(limpo),
    admin.id,
  );
}

export const chaveIaConfigurada = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());
export const tokenMaquinaConfigurado = () => Boolean(process.env.IA_COMP_TOKEN_MAQUINA?.trim());

// ---------- Fila ----------

export const jobDoPedido = (pedidoId: number) => um<JobIaComp>("SELECT * FROM ia_comp_jobs WHERE pedido_id = ?", pedidoId);
export const pastaDoJob = (id: number) => path.join(PASTA_IA, String(id));
export const arquivoDoJob = (id: number, tipo: TipoArquivoIaComp) => path.join(pastaDoJob(id), NOME_ARQUIVO[tipo]);
const pastaDaVersao = (jobId: number, versaoId: number) => path.join(pastaDoJob(jobId), "versoes", String(versaoId));
export const arquivoDaVersao = (jobId: number, versaoId: number, tipo: TipoArquivoIaComp) =>
  path.join(pastaDaVersao(jobId, versaoId), NOME_ARQUIVO[tipo]);

/** Versões anteriores do job, da mais nova para a mais antiga. */
export const versoesDoJob = (jobId: number) =>
  varios<VersaoIaComp>("SELECT * FROM ia_comp_versoes WHERE job_id = ? ORDER BY id DESC", jobId);

export function sugestoesDo(job: { sugestoes: string | null }): Sugestoes | null {
  if (!job.sugestoes) return null;
  try {
    return JSON.parse(job.sugestoes) as Sugestoes;
  } catch {
    return null;
  }
}

const EM_ANDAMENTO: StatusJob[] = ["gerando", "na_maquina"];

/** Guarda a versão atual do job (sugestões, gasto e arquivos) antes de ela ser substituída. */
function arquivarVersaoAtual(job: JobIaComp) {
  const tipos = (Object.keys(NOME_ARQUIVO) as TipoArquivoIaComp[]).filter((t) => fs.existsSync(arquivoDoJob(job.id, t)));
  if (!tipos.length && !job.sugestoes) return null;
  const versaoId = executar(
    `INSERT INTO ia_comp_versoes (job_id, origem, nota, especificacao, sugestoes, modelo, tokens_entrada, tokens_saida, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    job.id, job.origem, job.nota, job.especificacao, job.sugestoes, job.modelo, job.tokens_entrada, job.tokens_saida, job.atualizado_em,
  ).id;
  fs.mkdirSync(pastaDaVersao(job.id, versaoId), { recursive: true });
  for (const t of tipos) fs.renameSync(arquivoDoJob(job.id, t), arquivoDaVersao(job.id, versaoId, t));
  return versaoId;
}

function enfileirar(pedidoId: number, c: ConfigIaComp) {
  const antigo = jobDoPedido(pedidoId);
  if (!antigo)
    return executar("INSERT INTO ia_comp_jobs (pedido_id, status, modo, usar_ia) VALUES (?, 'pendente', ?, ?)", pedidoId, c.modo, c.usarIA ? 1 : 0).id;
  if (EM_ANDAMENTO.includes(antigo.status)) throw new ErroNegocio("A versão atual ainda está sendo gerada. Aguarde terminar.");
  arquivarVersaoAtual(antigo);
  executar(
    `UPDATE ia_comp_jobs SET status = 'pendente', modo = ?, usar_ia = ?, sugestoes = NULL, modelo = NULL, tokens_entrada = 0,
       tokens_saida = 0, erro = NULL, maquina_desde = NULL, origem = 'ia', nota = NULL, especificacao = NULL, criado_em = datetime('now'),
       atualizado_em = datetime('now') WHERE id = ?`,
    c.modo, c.usarIA ? 1 : 0, antigo.id,
  );
  return antigo.id;
}

/**
 * Versão feita fora do site (pelo Claude no chat, sem gastar a API): guarda a versão atual,
 * mantém as sugestões e o kit (são a base usada) e deixa o job esperando a composição e a
 * prévia, enviadas pelas mesmas rotas da máquina operária (scripts/ia-comp-enviar.mjs).
 */
export function novaVersaoManual(jobId: number, nota: string, especificacao = "") {
  const job = um<JobIaComp>("SELECT * FROM ia_comp_jobs WHERE id = ?", jobId);
  if (!job) throw new ErroNegocio("Trabalho não encontrado.", 404);
  if (EM_ANDAMENTO.includes(job.status)) throw new ErroNegocio("A versão atual ainda está sendo gerada. Aguarde terminar.", 409);
  const versaoId = arquivarVersaoAtual(job);
  const kitAntigo = versaoId ? arquivoDaVersao(jobId, versaoId, "kit") : null;
  if (kitAntigo && fs.existsSync(kitAntigo)) fs.copyFileSync(kitAntigo, arquivoDoJob(jobId, "kit"));
  mudar(jobId, "na_maquina", {
    origem: "chat",
    nota: nota.trim().slice(0, 2000) || null,
    especificacao: especificacao.trim().slice(0, 100_000) || null,
    modelo: "Claude (chat)",
    tokens_entrada: 0,
    tokens_saida: 0,
    erro: null,
    maquina_desde: new Date().toISOString().replace("T", " ").slice(0, 19),
  });
}

/** Chamado quando um pedido é criado: só entra na fila se a IA Comp estiver ligada. */
export function aoCriarPedido(pedidoId: number) {
  const c = configIaComp();
  if (c.ativo) enfileirar(pedidoId, c);
}

/** Admin gera (ou refaz) para um pedido, com a configuração atual, mesmo com a IA Comp desligada. */
export function gerarParaPedido(admin: Usuario, pedidoId: number) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador gera a IA Comp manualmente.", 403);
  if (!um("SELECT 1 FROM pedidos WHERE id = ?", pedidoId)) throw new ErroNegocio("Pedido não encontrado.", 404);
  enfileirar(pedidoId, configIaComp());
}

function mudar(id: number, status: StatusJob, extra: Record<string, string | number | null> = {}) {
  const sets = ["status = ?", "atualizado_em = datetime('now')", ...Object.keys(extra).map((k) => `${k} = ?`)];
  executar(`UPDATE ia_comp_jobs SET ${sets.join(", ")} WHERE id = ?`, status, ...Object.values(extra), id);
}

/** Processa a fila (a cada 30 s, em instrumentation.ts). Um job por vez. */
export async function processarFilaIaComp() {
  const g = globalThis as typeof globalThis & { __dkIaComp?: boolean };
  if (g.__dkIaComp) return;
  g.__dkIaComp = true;
  try {
    // Máquina que pegou um job e sumiu há mais de 20 minutos: o job volta para a fila dela.
    executar(
      "UPDATE ia_comp_jobs SET status = 'aguardando_maquina', maquina_desde = NULL WHERE status = 'na_maquina' AND maquina_desde < datetime('now', '-20 minutes')",
    );
    const job = um<JobIaComp>("SELECT * FROM ia_comp_jobs WHERE status = 'pendente' ORDER BY id LIMIT 1");
    if (!job) return;
    mudar(job.id, "gerando");
    try {
      const dados = dadosDoPedido(job.pedido_id);
      let sugestoes: Sugestoes | null = null;
      if (job.usar_ia && chaveIaConfigurada()) {
        const r = await pedirSugestoes(dados);
        sugestoes = r.sugestoes;
        executar(
          "UPDATE ia_comp_jobs SET sugestoes = ?, modelo = ?, tokens_entrada = ?, tokens_saida = ? WHERE id = ?",
          JSON.stringify(sugestoes),
          r.modelo,
          r.entrada,
          r.saida,
          job.id,
        );
      }
      montarKit(job.id, dados, sugestoes);
      mudar(job.id, job.modo === "operaria" ? "aguardando_maquina" : "pronto", {
        erro: job.usar_ia && !chaveIaConfigurada() ? "Kit gerado sem sugestões: ANTHROPIC_API_KEY não configurada." : null,
      });
    } catch (e) {
      console.error("[ia-comp] Falha no job", job.id, e);
      mudar(job.id, "erro", { erro: textoDoErro(e) });
    }
  } finally {
    g.__dkIaComp = false;
  }
}

function textoDoErro(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError) return "Chave da API da Anthropic inválida.";
  if (e instanceof Anthropic.RateLimitError) return "Limite de uso da API atingido. Tente de novo em alguns minutos.";
  if (e instanceof Anthropic.APIError) return `Erro da API (${e.status}): ${e.message}`.slice(0, 500);
  if (e instanceof ErroNegocio) return e.message;
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}

// ---------- Dados do pedido ----------

interface DadosPedido {
  id: number;
  codigo: string;
  titulo: string;
  tipo: string;
  b: Briefing;
  marca: { nome: string; cores: string[]; observacoes: string } | null;
  arquivos: { id: number; categoria: string; nome: string; caminho: string; mime: string; tamanho: number }[];
}

function dadosDoPedido(pedidoId: number): DadosPedido {
  const p = um<{ id: number; codigo: string; titulo: string; tipo: string; briefing: string; marca_id: number | null }>(
    "SELECT id, codigo, titulo, tipo, briefing, marca_id FROM pedidos WHERE id = ?",
    pedidoId,
  );
  if (!p) throw new ErroNegocio("Pedido não encontrado.");
  const b = atualizarBriefing(JSON.parse(p.briefing));
  const m = p.marca_id
    ? um<{ nome: string; cores: string | null; observacoes: string | null }>("SELECT nome, cores, observacoes FROM marcas WHERE id = ?", p.marca_id)
    : undefined;
  let cores = b.cores;
  try {
    if (m?.cores) cores = JSON.parse(m.cores) as string[];
  } catch {}
  const arquivos = arquivosPorIds([...b.arquivos.logo, ...b.arquivos.manual, ...b.arquivos.fotos]).map((a) => ({
    id: a.id,
    categoria: a.categoria,
    nome: a.nome,
    caminho: caminhoAbsoluto(a),
    mime: a.mime,
    tamanho: a.tamanho,
  }));
  return {
    id: p.id,
    codigo: p.codigo,
    titulo: p.titulo,
    tipo: p.tipo,
    b,
    marca: m ? { nome: m.nome, cores, observacoes: m.observacoes ?? "" } : null,
    arquivos,
  };
}

/** O briefing em texto corrido, com rótulos, para a IA e para o guia dentro do After. */
function briefingEmTexto(d: DadosPedido) {
  const b = d.b;
  const linhas: [string, string | null | undefined][] = [
    ["Pedido", `${d.codigo} · ${d.titulo}`],
    ["Tipo de peça", pecaDo(b)?.nome],
    ["Duração", b.duracao ? `${b.duracao} segundos` : null],
    ["Proporções", b.formatos.join(", ")],
    ["Objetivo", objetivoTexto(b)],
    ["Público", b.publico],
    ["Onde publica", b.plataformas.join(", ")],
    ["Chamada para ação", b.cta],
    ["Usos da vinheta", b.uso.join(", ")],
    ["Áudio", b.audio],
    ["Legendas", b.legendas],
    ["Roteiro do cliente (cenas)", b.semRoteiro ? null : b.cenas.filter((c) => c.trim()).map((c, i) => `Cena ${i + 1}: ${c}`).join(" | ")],
    ["Ideia (cliente sem roteiro)", b.semRoteiro ? b.ideia : null],
    ["Texto da locução", b.locucao],
    ["Tipo de voz", b.voz],
    ["Informações obrigatórias", b.obrig],
    ["Como o logo aparece", revelacaoTexto(b)],
    ["Slogan", b.slogan],
    ["Marca", d.marca?.nome],
    ["Cores da marca", d.marca?.cores.join(", ") || b.cores.join(", ")],
    ["Observações da marca", d.marca?.observacoes],
    ["Visual", b.visual === "especial" ? "Visual especial de campanha" : b.visual === "padrao" ? "Seguir o padrão da marca" : null],
    ["Estilo de animação", b.estilo.join(", ")],
    ["Tom", tonsTexto(b)],
    ["Referências", b.refs.filter((r) => r.url).map((r) => `${r.url}${r.gosta ? ` (gosta de: ${r.gosta})` : ""}`).join(" | ")],
    ["Evitar", b.evitar],
    ["Prazo", b.prazo === "urgente" ? "Urgente" : "Padrão"],
  ];
  return linhas.filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${v}`).join("\n");
}

// ---------- IA (Claude) ----------

const SISTEMA = `Você apoia a equipe de um estúdio brasileiro de edição e motion graphics. A produção é feita por designers humanos; você prepara um ponto de partida interno para o designer do pedido, que vai usar, ajustar ou descartar.

A partir do briefing do cliente, proponha:
- um conceito curto e até três linhas criativas;
- as cenas, cobrindo a duração inteira, com início e fim em segundos, o texto que aparece na tela, a locução (vazia se a peça não tiver locução) e uma descrição do visual e do movimento;
- a paleta em hex, partindo das cores da marca;
- tipografia, ritmo de montagem, clima da trilha e observações práticas para o designer.

Regras:
- Se o cliente mandou o roteiro por cenas, mantenha o conteúdo dele e só distribua os tempos e ajuste a forma.
- Textos de tela curtos. Locução com no máximo 1,5 palavra por segundo da cena.
- Não invente preços, promoções, dados ou promessas que não estejam no briefing. Respeite o que o cliente pediu para evitar.
- Escreva em português do Brasil.`;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["conceito", "linhas_criativas", "cenas", "paleta", "tipografia", "ritmo", "trilha", "observacoes"],
  properties: {
    conceito: { type: "string" },
    linhas_criativas: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["titulo", "descricao"], properties: { titulo: { type: "string" }, descricao: { type: "string" } } },
    },
    cenas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["inicio", "fim", "texto_tela", "locucao", "visual"],
        properties: {
          inicio: { type: "number" },
          fim: { type: "number" },
          texto_tela: { type: "string" },
          locucao: { type: "string" },
          visual: { type: "string" },
        },
      },
    },
    paleta: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["hex", "uso"], properties: { hex: { type: "string" }, uso: { type: "string" } } },
    },
    tipografia: { type: "string" },
    ritmo: { type: "string" },
    trilha: { type: "string" },
    observacoes: { type: "string" },
  },
};

const TIPOS_IMAGEM = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

async function pedirSugestoes(d: DadosPedido) {
  const client = new Anthropic(); // ANTHROPIC_API_KEY do .env.local
  // O logo (e até 2 fotos) vão como imagem, para a IA ler cores e formas. SVG/AI/PDF não entram.
  const imagens = d.arquivos
    .filter((a) => (a.categoria === "logo" || a.categoria === "foto") && (TIPOS_IMAGEM as readonly string[]).includes(a.mime) && a.tamanho < 5 * 1024 * 1024)
    .slice(0, 3)
    .filter((a) => fs.existsSync(a.caminho))
    .map((a) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: a.mime as (typeof TIPOS_IMAGEM)[number], data: fs.readFileSync(a.caminho).toString("base64") },
    }));
  const resp = await client.beta.messages.create({
    model: MODELO_IA,
    max_tokens: 16000,
    // Se o modelo recusar por política, a própria API refaz no modelo recomendado.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
    system: SISTEMA,
    messages: [
      {
        role: "user",
        content: [...imagens, { type: "text", text: `Briefing do pedido:\n\n${briefingEmTexto(d)}` }],
      },
    ],
  });
  if (resp.stop_reason === "refusal") throw new ErroNegocio("A IA recusou este briefing. Gere o kit sem IA ou revise o pedido.");
  if (resp.stop_reason === "max_tokens") throw new ErroNegocio("A resposta da IA ficou longa demais e foi cortada. Tente de novo.");
  const texto = resp.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
  let sugestoes: Sugestoes;
  try {
    sugestoes = JSON.parse(texto) as Sugestoes;
  } catch {
    throw new ErroNegocio("A resposta da IA veio num formato inesperado.");
  }
  return { sugestoes, modelo: resp.model, entrada: resp.usage.input_tokens, saida: resp.usage.output_tokens };
}

// ---------- Kit para o After Effects ----------

const LEIA_ME = `KIT IA COMP · Dark Kitchen Studio

1. Descompacte esta pasta (o script precisa dos arquivos ao lado dele).
2. No After Effects: File > Scripts > Run Script File... e escolha montar-comp.jsx.
3. O script cria, no projeto aberto, a pasta do pedido com:
   - uma composição por proporção pedida, na duração do pedido;
   - as cenas sugeridas como marcadores e camadas de texto;
   - o logo e as imagens do cliente importados;
   - a paleta e um guia (camada guia, não renderiza) com o briefing e as sugestões.

As sugestões são um ponto de partida interno: ajuste ou descarte à vontade.
pedido.json tem os dados do pedido em texto; registro.json, o pedido exatamente como está salvo.
`;

/** JSON só com ASCII (acentos como \\uXXXX), para o ExtendScript ler sem problema de codificação. */
const jsonAscii = (v: unknown) => JSON.stringify(v, null, 1).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

/**
 * O pedido exatamente como está salvo (todos os campos do briefing, marca, arquivos e o que
 * foi cobrado), para quem cria a peça (designer ou Claude no chat) partir do registro íntegro.
 * Sem dados pessoais do cliente além do nome.
 */
function registroDoPedido(d: DadosPedido, assets: { id: number; nome: string }[]) {
  const json = (v: unknown) => {
    if (typeof v !== "string" || !v) return v ?? null;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  };
  const p = um<Record<string, unknown>>(
    "SELECT p.*, u.nome AS cliente_nome FROM pedidos p JOIN usuarios u ON u.id = p.cliente_id WHERE p.id = ?",
    d.id,
  )!;
  const marca = p.marca_id ? um<Record<string, unknown>>("SELECT * FROM marcas WHERE id = ?", Number(p.marca_id)) : null;
  return {
    pedido: { ...p, briefing: undefined, creditos_detalhe: json(p.creditos_detalhe) },
    briefing: json(p.briefing),
    briefing_atualizado: d.b,
    marca: marca ? { ...marca, cores: json(marca.cores) } : null,
    arquivos: d.arquivos.map((a) => ({
      id: a.id,
      categoria: a.categoria,
      nome: a.nome,
      mime: a.mime,
      tamanho: a.tamanho,
      no_kit: assets.find((x) => x.id === a.id) ? `assets/${assets.find((x) => x.id === a.id)!.nome}` : null,
    })),
  };
}

function montarKit(jobId: number, d: DadosPedido, sugestoes: Sugestoes | null) {
  if (!fs.existsSync(SCRIPT_AE)) throw new ErroNegocio("Script do After (ia-comp/montar-comp.jsx) não encontrado no servidor.");
  const usados = new Set<string>();
  const assets = d.arquivos
    .filter((a) => fs.existsSync(a.caminho))
    .map((a) => {
      let nome = `${a.categoria}-${path.basename(a.nome).replace(/[^\w.\-]+/g, "_")}`;
      while (usados.has(nome)) nome = `${crypto.randomBytes(2).toString("hex")}-${nome}`;
      usados.add(nome);
      return { id: a.id, nome, categoria: a.categoria, caminho: a.caminho };
    });
  const b = d.b;
  const duracao = b.duracao || Math.max(10, ...(sugestoes?.cenas ?? []).map((c) => c.fim));
  // Sem sugestões da IA, as cenas vêm do roteiro do cliente, divididas por igual.
  const cenasCliente = b.cenas.filter((c) => c.trim());
  const cenas =
    sugestoes?.cenas ??
    cenasCliente.map((c, i) => ({
      inicio: (duracao / cenasCliente.length) * i,
      fim: (duracao / cenasCliente.length) * (i + 1),
      texto_tela: c,
      locucao: "",
      visual: "",
    }));
  const pedido = {
    codigo: d.codigo,
    titulo: d.titulo,
    tipo: pecaDo(b)?.nome ?? d.tipo,
    duracao,
    formatos: b.formatos.length ? b.formatos : ["16:9"],
    marca: d.marca?.nome ?? "",
    cores: (sugestoes?.paleta.map((p) => p.hex) ?? d.marca?.cores ?? b.cores).filter((h) => /^#[0-9a-f]{6}$/i.test(h)),
    cenas,
    sugestoes,
    briefing: briefingEmTexto(d),
    assets: assets.map((a) => ({ arquivo: `assets/${a.nome}`, categoria: a.categoria })),
  };
  const entradas = [
    { nome: "LEIA-ME.txt", dados: Buffer.from(LEIA_ME, "utf8") },
    { nome: "pedido.json", dados: Buffer.from(JSON.stringify(pedido, null, 2), "utf8") },
    { nome: "registro.json", dados: Buffer.from(JSON.stringify(registroDoPedido(d, assets), null, 2), "utf8") },
    { nome: "pedido.jsxinc", dados: Buffer.from(`var PEDIDO = ${jsonAscii(pedido)};\n`, "utf8") },
    { nome: "montar-comp.jsx", dados: fs.readFileSync(SCRIPT_AE) },
    ...assets.map((a) => ({ nome: `assets/${a.nome}`, dados: fs.readFileSync(a.caminho) })),
  ];
  fs.mkdirSync(pastaDoJob(jobId), { recursive: true });
  fs.writeFileSync(arquivoDoJob(jobId, "kit"), criarZip(entradas));
}

// ---------- Máquina operária (API) ----------

/** Confere o token da máquina (Authorization: Bearer ...), sem vazar tempo de comparação. */
export function maquinaAutorizada(req: Request) {
  const esperado = process.env.IA_COMP_TOKEN_MAQUINA?.trim();
  const veio = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!esperado || !veio) return false;
  const a = Buffer.from(esperado), b = Buffer.from(veio);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (ok)
    executar(
      `INSERT INTO configuracoes (chave, valor, atualizado_em) VALUES ('ia_comp_maquina', datetime('now'), datetime('now'))
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`,
    );
  return ok;
}

export const ultimaVisitaMaquina = () => um<{ valor: string }>("SELECT valor FROM configuracoes WHERE chave = 'ia_comp_maquina'")?.valor ?? null;

/** Entrega o próximo job à máquina operária (e marca como "na máquina"). */
export function proximoParaMaquina() {
  const job = um<JobIaComp & { codigo: string }>(
    `SELECT j.*, p.codigo FROM ia_comp_jobs j JOIN pedidos p ON p.id = j.pedido_id
     WHERE j.status = 'aguardando_maquina' ORDER BY j.id LIMIT 1`,
  );
  if (!job) return null;
  mudar(job.id, "na_maquina", { maquina_desde: new Date().toISOString().replace("T", " ").slice(0, 19) });
  return { id: job.id, codigo: job.codigo };
}

/** Grava a composição (.zip com o .aep e a pasta assets/) ou a prévia enviadas pela máquina (corpo em fluxo). */
export async function receberDaMaquina(jobId: number, tipo: "aep" | "previa", corpo: ReadableStream<Uint8Array> | null) {
  const job = um<JobIaComp>("SELECT * FROM ia_comp_jobs WHERE id = ?", jobId);
  if (!job || job.status !== "na_maquina") throw new ErroNegocio("Este trabalho não está com a máquina.", 409);
  if (!corpo) throw new ErroNegocio("Nenhum arquivo enviado.");
  const limite = 500 * 1024 * 1024;
  const destino = arquivoDoJob(jobId, tipo), temp = destino + ".parcial";
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const saida = fs.createWriteStream(temp);
  let total = 0;
  try {
    for await (const pedaco of corpo as unknown as AsyncIterable<Uint8Array>) {
      total += pedaco.length;
      if (total > limite) throw new ErroNegocio("Arquivo grande demais.");
      if (!saida.write(pedaco)) await new Promise<void>((r) => saida.once("drain", () => r()));
    }
    await new Promise<void>((ok, erro) => saida.end((e?: Error | null) => (e ? erro(e) : ok())));
    fs.renameSync(temp, destino);
  } catch (e) {
    saida.destroy();
    fs.rmSync(temp, { force: true });
    throw e;
  }
  if (tipo === "aep") {
    mudar(jobId, "pronto", { maquina_desde: null });
    // Criação pedida ao Claude no chat: sai da fila e quem pediu é avisado.
    if (job.origem === "chat" && job.claude_status) {
      executar("UPDATE ia_comp_jobs SET claude_status = NULL WHERE id = ?", jobId);
      const p = um<{ id: number; codigo: string }>("SELECT id, codigo FROM pedidos WHERE id = ?", job.pedido_id);
      if (p && job.claude_pedido_por)
        notificar(job.claude_pedido_por, `IA Comp: o Claude terminou a criação do ${p.codigo}.`, `/equipe/pedidos/${p.id}`, SEM_EMAIL);
    }
  }
}

export function falhaDaMaquina(jobId: number, erro: string) {
  mudar(jobId, "erro", { erro: `Máquina operária: ${erro}`.slice(0, 500), maquina_desde: null });
}

// ---------- Fila do Claude no chat ----------

/**
 * Admin pede ao Claude (no chat, sem API) a criação do projeto do After para o pedido.
 * Sem kit ainda, gera um (sem IA). O Claude vê o pedido pela fila com o token da máquina.
 */
export function pedirAoClaude(admin: Usuario, pedidoId: number, instrucoes: string) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador pede criações ao Claude.", 403);
  if (!um("SELECT 1 FROM pedidos WHERE id = ?", pedidoId)) throw new ErroNegocio("Pedido não encontrado.", 404);
  let job = jobDoPedido(pedidoId);
  if (!job) {
    enfileirar(pedidoId, { ...configIaComp(), usarIA: false, modo: "kit" });
    job = jobDoPedido(pedidoId)!;
  }
  if (job.claude_status === "criando") throw new ErroNegocio("O Claude já está criando este pedido.");
  // Kit sempre refeito com o registro atual do pedido (kits antigos não têm o registro.json).
  if (job.status === "pronto" || job.status === "erro") montarKit(job.id, dadosDoPedido(pedidoId), sugestoesDo(job));
  executar(
    `UPDATE ia_comp_jobs SET claude_status = 'aguardando', claude_instrucoes = ?, claude_pedido_em = datetime('now'),
       claude_pedido_por = ? WHERE id = ?`,
    instrucoes.trim().slice(0, 4000) || null,
    admin.id,
    job.id,
  );
}

export function cancelarPedidoAoClaude(admin: Usuario, pedidoId: number) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador altera a fila do Claude.", 403);
  executar("UPDATE ia_comp_jobs SET claude_status = NULL WHERE pedido_id = ? AND claude_status = 'aguardando'", pedidoId);
}

/** Fila para o Claude (token da máquina): pedidos aguardando ou em criação, mais antigos primeiro. */
export function filaDoClaude() {
  return varios<{ id: number; codigo: string; titulo: string; status: StatusJob; claude_status: string; claude_instrucoes: string | null; claude_pedido_em: string }>(
    `SELECT j.id, p.codigo, p.titulo, j.status, j.claude_status, j.claude_instrucoes, j.claude_pedido_em
     FROM ia_comp_jobs j JOIN pedidos p ON p.id = j.pedido_id
     WHERE j.claude_status IS NOT NULL ORDER BY j.claude_pedido_em`,
  ).map((j) => ({ ...j, kitPronto: fs.existsSync(arquivoDoJob(j.id, "kit")), kit: `/api/v1/ia-comp/${j.id}/arquivo/kit` }));
}

/** O Claude avisa que começou a criar (o pedido aparece como "Claude criando"). */
export function claudeComecou(jobId: number) {
  const r = executar("UPDATE ia_comp_jobs SET claude_status = 'criando' WHERE id = ? AND claude_status IS NOT NULL", jobId);
  if (!r.alterados) throw new ErroNegocio("Este pedido não está na fila do Claude.", 409);
}

// ---------- Tela do admin ----------

export function resumoIaComp() {
  // O gasto soma a versão atual de cada job e as versões anteriores guardadas.
  const t = um<{ n: number; entrada: number; saida: number }>(
    `SELECT (SELECT COUNT(*) FROM ia_comp_jobs) n,
       (SELECT COALESCE(SUM(tokens_entrada), 0) FROM ia_comp_jobs) + (SELECT COALESCE(SUM(tokens_entrada), 0) FROM ia_comp_versoes) entrada,
       (SELECT COALESCE(SUM(tokens_saida), 0) FROM ia_comp_jobs) + (SELECT COALESCE(SUM(tokens_saida), 0) FROM ia_comp_versoes) saida`,
  )!;
  const custo = (t.entrada * PRECO_MTOK.entrada + t.saida * PRECO_MTOK.saida) / 1_000_000;
  const recentes = varios<JobIaComp & { codigo: string; titulo: string }>(
    `SELECT j.*, p.codigo, p.titulo FROM ia_comp_jobs j JOIN pedidos p ON p.id = j.pedido_id ORDER BY j.id DESC LIMIT 20`,
  );
  return { total: t.n, tokensEntrada: t.entrada, tokensSaida: t.saida, custoUsd: custo, recentes };
}
