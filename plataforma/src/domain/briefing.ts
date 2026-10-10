// Briefing: estrutura, cálculo de créditos e validação por etapa.
// Código puro, usado tanto no formulário (navegador) quanto no servidor.

import { PECAS, type Peca, type TipoPeca } from "./catalogo";
import { type TabelaPrecos, creditosLocucao, creditosRoteiro, faixaCreditos, tabelaCreditos } from "./precos";

export interface Referencia {
  url: string;
  gosta: string;
}

export interface Briefing {
  tipo: TipoPeca | null;
  nome: string; // nome curto do pedido, opcional
  // Contexto
  objetivo: string | null;
  objetivoOutro: string; // com objetivo "Outro": o cliente explica o job
  publico: string;
  plataformas: string[];
  cta: string;
  uso: string[]; // só logo
  // Técnico
  formatos: string[];
  duracao: number | null;
  audio: string | null;
  legendas: "Sim" | "Não" | null;
  aberto: boolean;
  // Conteúdo
  cenas: string[];
  semRoteiro: boolean;
  ideia: string;
  locucao: string;
  voz: string | null;
  obrig: string;
  revelacao: string | null; // só logo
  slogan: string; // só logo
  // Marca: o pedido pertence a uma das marcas do cliente (ids de arquivos enviados)
  marcaId: number | null;
  arquivos: { logo: number[]; manual: number[]; fotos: number[] };
  cores: string[];
  visual: "padrao" | "especial" | null;
  // Estilo
  estilo: string[];
  refs: Referencia[];
  tons: string[]; // até MAX_ESCOLHAS (antes de out/2026 era um só, no campo "tom")
  tomOutro: string; // com tom "Outro"
  evitar: string;
  // Prazo
  prazo: "padrao" | "urgente";
  aprovador: string;
  email: string;
}

export const ETAPAS = ["Tipo", "Contexto", "Técnico", "Conteúdo", "Marca", "Estilo", "Prazo", "Revisão"] as const;

export const OPCOES = {
  objetivos: ["Vender produto", "Divulgar evento", "Explicar serviço", "Fortalecer marca", "Comunicação interna", "Outro"],
  plataformas: ["Instagram Reels", "Stories", "Feed", "TikTok", "YouTube", "YouTube Shorts", "LinkedIn", "Anúncio pago"],
  usosLogo: ["Abertura de vídeos", "Fim de vídeos", "Redes sociais", "Apresentações", "Site"],
  formatos: [
    ["9:16", "Vertical 9:16"],
    ["1:1", "Quadrado 1:1"],
    ["4:5", "Feed 4:5"],
    ["16:9", "Horizontal 16:9"],
  ] as [string, string][],
  revelacoes: ["Montagem por partes", "Desenho do traço", "Revelação com luz", "Transformação de forma", "A critério do designer"],
  vozes: ["Feminina jovem", "Feminina madura", "Masculina jovem", "Masculina madura"],
  estilos: [
    "Tipografia animada",
    "Colagem",
    "Minimalista",
    "Animação de personagem",
    "Clean",
    "Orgânica",
    "Tech",
    "Vintage",
    "Vibrante",
    "Luxo",
    "Corporativo",
    "Lúdico",
    "Ilustrado",
    "Industrial",
    "Urbano",
    "Campo",
    "Natureza",
    "Cultura POP",
    "Geométrico",
    "Abstrato",
    "Artesanal",
    "Futurista",
  ],
  tons: [
    "Manifesto",
    "Problema",
    "Solução",
    "Transformação",
    "Processo",
    "Tutorial",
    "Sensorial",
    "Depoimento",
    "Humor",
    "Inspiracional",
    "Dinâmico",
    "Contemplativo",
    "Comparativo",
    "Realista",
    "Teaser",
    "Outro",
  ],
};

/**
 * Proporção recomendada de cada lugar de publicação (out/2026). Ao marcar onde vai
 * publicar, o briefing já marca as proporções; lugares com a mesma proporção viram
 * uma saída só. null: depende da campanha, o cliente escolhe.
 */
export const PROPORCAO_DA_PLATAFORMA: Record<string, string | null> = {
  "Instagram Reels": "9:16", // 1080 × 1920
  Stories: "9:16",
  Feed: "4:5", // 1080 × 1350, o mais recomendado no feed do Instagram
  TikTok: "9:16",
  YouTube: "16:9", // vídeo tradicional, 1920 × 1080
  "YouTube Shorts": "9:16",
  LinkedIn: "4:5", // feed, 1080 × 1350
  "Anúncio pago": null,
};

const ordemFormatos = (fs: Iterable<string>) => {
  const set = new Set(fs);
  const conhecidos = OPCOES.formatos.map(([v]) => v).filter((v) => set.has(v));
  return [...conhecidos, ...[...set].filter((v) => !conhecidos.includes(v))];
};

/** Proporções necessárias para os lugares escolhidos, sem repetir. */
export const proporcoesDe = (plataformas: string[]) =>
  ordemFormatos(plataformas.map((p) => PROPORCAO_DA_PLATAFORMA[p]).filter((v): v is string => Boolean(v)));

/**
 * Proporções depois de mudar onde vai publicar: entram as dos lugares novos e saem as
 * que só o lugar desmarcado usava. As que o cliente marcou à mão continuam.
 */
export function formatosAoMudarPlataformas(formatos: string[], antes: string[], depois: string[]) {
  const eram = proporcoesDe(antes);
  const agora = proporcoesDe(depois);
  return ordemFormatos([...formatos.filter((f) => agora.includes(f) || !eram.includes(f)), ...agora]);
}

/** Estilo de animação e tom: o cliente escolhe até este número de opções em cada um. */
export const MAX_ESCOLHAS = 5;

export const OUTRO = "Outro";

/** Objetivo e tons para mostrar, com o texto do "Outro" no lugar. */
export const objetivoTexto = (b: Briefing) => (b.objetivo === OUTRO && b.objetivoOutro.trim() ? `Outro: ${b.objetivoOutro.trim()}` : b.objetivo);
export const tonsTexto = (b: Briefing) =>
  b.tons.map((t) => (t === OUTRO && b.tomOutro.trim() ? `Outro: ${b.tomOutro.trim()}` : t)).join(", ");

/** Briefing guardado (pedido ou rascunho) no formato atual: campos novos com o padrão e o tom antigo (um só) virando lista. */
export function atualizarBriefing(salvo: Partial<Briefing> & { tom?: unknown }): Briefing {
  const { tom, ...resto } = salvo;
  const b = { ...briefingVazio(), ...resto };
  if (!Array.isArray(salvo.tons)) b.tons = typeof tom === "string" && tom ? [tom] : [];
  return b;
}

export const LOCUCAO = "Com locução";
export const SO_TRILHA = "Só trilha";
export const TRILHA_EFEITOS = "Trilha e efeitos";

export function briefingVazio(): Briefing {
  return {
    tipo: null,
    nome: "",
    objetivo: null,
    objetivoOutro: "",
    publico: "",
    plataformas: [],
    cta: "",
    uso: [],
    formatos: [],
    duracao: null,
    audio: null,
    legendas: null,
    aberto: false,
    cenas: ["", ""],
    semRoteiro: false,
    ideia: "",
    locucao: "",
    voz: null,
    obrig: "",
    revelacao: null,
    slogan: "",
    marcaId: null,
    arquivos: { logo: [], manual: [], fotos: [] },
    cores: ["#4B3BFF", "#FFD23F"],
    visual: null,
    estilo: [],
    refs: [{ url: "", gosta: "" }],
    tons: [],
    tomOutro: "",
    evitar: "",
    prazo: "padrao",
    aprovador: "",
    email: "",
  };
}

export const pecaDo = (b: Pick<Briefing, "tipo">): Peca | undefined => PECAS.find((p) => p.id === b.tipo);

export const opcoesAudio = (b: Briefing): string[] => {
  if (b.tipo === "logo") return ["Sem som", "Efeito sonoro de assinatura"];
  const base = ["Sem som", SO_TRILHA, TRILHA_EFEITOS];
  return pecaDo(b)?.aceitaLocucao ? [...base, LOCUCAO] : base;
};

export const contarPalavras = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/** Limite de palavras na tela: ~1,5 palavra por segundo. */
export const limitePalavras = (b: Briefing) => Math.round((b.duracao ?? pecaDo(b)?.duracoes[0] ?? 0) * 1.5);

export interface LinhaCredito {
  descricao: string;
  creditos: number;
}

/** Créditos do pedido pela tabela de preços atual. O servidor sempre recalcula. */
export function calcularCreditos(b: Briefing, t: TabelaPrecos): { linhas: LinhaCredito[]; total: number } {
  const peca = pecaDo(b);
  if (!peca) return { linhas: [], total: 0 };
  const tc = tabelaCreditos(t);
  const faixa = faixaCreditos(tc, peca.id, b.duracao);
  const linhas: LinhaCredito[] = [
    { descricao: b.duracao ? `${peca.nome} (${faixa.ate}s)` : peca.nome, creditos: faixa.creditos },
  ];
  const extras = b.formatos.length - 1;
  if (extras > 0 && tc.formatoExtra)
    linhas.push({ descricao: `${extras} formato${extras > 1 ? "s" : ""} extra`, creditos: extras * tc.formatoExtra });
  if (b.audio === SO_TRILHA && tc.trilha) linhas.push({ descricao: "Trilha sonora", creditos: tc.trilha });
  if (b.audio === TRILHA_EFEITOS && tc.trilhaEfeitos)
    linhas.push({ descricao: "Trilha e efeitos sonoros", creditos: tc.trilhaEfeitos });
  if (b.legendas === "Sim" && b.tipo !== "logo" && tc.legendas) linhas.push({ descricao: "Legendas", creditos: tc.legendas });
  const locucao = creditosLocucao(tc, b.duracao);
  if (b.audio === LOCUCAO && locucao) linhas.push({ descricao: "Locução profissional", creditos: locucao });
  const roteiro = creditosRoteiro(tc, b.duracao);
  if (b.semRoteiro && b.tipo !== "logo" && roteiro) linhas.push({ descricao: "Criação de roteiro", creditos: roteiro });
  if (b.aberto && tc.arquivoAberto) linhas.push({ descricao: "Arquivo aberto (.aep)", creditos: tc.arquivoAberto });
  let total = linhas.reduce((s, l) => s + l.creditos, 0);
  if (b.prazo === "urgente" && t.urgenciaPct) {
    const u = Math.ceil((total * t.urgenciaPct) / 100);
    linhas.push({ descricao: "Entrega urgente", creditos: u });
    total += u;
  }
  return { linhas, total };
}

/** Créditos de cada adicional para a peça e duração do briefing (rótulos "+N" no formulário). */
export function creditosAdicionais(b: Briefing, t: TabelaPrecos) {
  const tc = tabelaCreditos(t);
  const peca = pecaDo(b);
  return {
    // Créditos da peça em cada duração (quanto mais longa, mais cara).
    duracoes: Object.fromEntries((peca?.duracoes ?? []).map((d) => [d, faixaCreditos(tc, peca!.id, d).creditos])) as Record<number, number>,
    formatoExtra: tc.formatoExtra,
    locucao: creditosLocucao(tc, b.duracao),
    roteiro: creditosRoteiro(tc, b.duracao),
    arquivoAberto: tc.arquivoAberto,
    trilha: tc.trilha,
    trilhaEfeitos: tc.trilhaEfeitos,
    legendas: tc.legendas,
    urgenciaPct: t.urgenciaPct,
  };
}

/** Prazo em dias úteis; urgente corta pela metade (mínimo 1). */
export const prazoUrgente = (dias: number) => Math.max(1, Math.ceil(dias / 2));

export const diasUteisDo = (b: Briefing, t: TabelaPrecos) => {
  const peca = pecaDo(b);
  if (!peca) return 0;
  const dias = t.pecas[peca.id].diasUteis;
  return b.prazo === "urgente" ? prazoUrgente(dias) : dias;
};

/** Créditos de uma rodada de ajuste além das incluídas (calculado pelo custo do retrabalho). */
export const custoRevisaoExtra = (tipo: TipoPeca, duracao: number | null, t: TabelaPrecos) =>
  faixaCreditos(tabelaCreditos(t), tipo, duracao).revisaoExtra;

const vazio = (s: string | null | undefined) => !s || !s.trim();

/** Campos com erro em uma etapa (0 a 6). Lista vazia = etapa válida. */
export function errosDaEtapa(b: Briefing, etapa: number): string[] {
  const logo = b.tipo === "logo";
  const e: (string | false)[] = [];
  switch (etapa) {
    case 0:
      e.push(!pecaDo(b) && "tipo");
      break;
    case 1:
      if (logo) e.push(!b.uso.length && "uso");
      else
        e.push(
          !b.objetivo && "objetivo",
          b.objetivo === OUTRO && vazio(b.objetivoOutro) && "objetivoOutro",
          vazio(b.publico) && "publico",
          !b.plataformas.length && "plataformas",
        );
      break;
    case 2:
      e.push(
        !b.formatos.length && "formatos",
        !(b.duracao && pecaDo(b)?.duracoes.includes(b.duracao)) && "duracao",
        !(b.audio && opcoesAudio(b).includes(b.audio)) && "audio",
        !logo && !b.legendas && "legendas",
      );
      break;
    case 3:
      if (logo) {
        e.push(!b.revelacao && "revelacao");
        break;
      }
      if (b.semRoteiro) e.push(vazio(b.ideia) && "ideia");
      else e.push(!b.cenas.some((c) => c.trim()) && "cenas");
      if (b.audio === LOCUCAO) e.push(vazio(b.locucao) && "locucao", !b.voz && "voz");
      break;
    case 4:
      e.push(!b.marcaId && "marca", !b.arquivos.logo.length && "logo", !b.visual && "visual");
      break;
    case 5:
      e.push(!b.estilo.length && "estilo", !b.tons.length && "tom", b.tons.includes(OUTRO) && vazio(b.tomOutro) && "tomOutro");
      break;
    case 6:
      e.push(vazio(b.aprovador) && "aprovador", !/^\S+@\S+\.\S+$/.test(b.email) && "email");
      break;
  }
  return e.filter((x): x is string => Boolean(x));
}

/** Primeira etapa com erro, ou -1 se o briefing inteiro é válido. */
export function primeiraEtapaInvalida(b: Briefing): number {
  for (let i = 0; i < 7; i++) if (errosDaEtapa(b, i).length) return i;
  return -1;
}

/** Nome padrão do pedido quando o cliente não informa um. */
export function nomeDoPedido(b: Briefing): string {
  if (b.nome.trim()) return b.nome.trim().slice(0, 80);
  const peca = pecaDo(b);
  const extra = b.tipo === "logo" ? b.uso[0] : b.objetivo === OUTRO ? b.objetivoOutro.trim().slice(0, 40) || null : b.objetivo;
  return [peca?.nome, extra].filter(Boolean).join(" · ");
}
