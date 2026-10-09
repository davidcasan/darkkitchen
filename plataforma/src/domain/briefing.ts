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
  tom: string | null;
  evitar: string;
  // Prazo
  prazo: "padrao" | "urgente";
  aprovador: string;
  email: string;
}

export const ETAPAS = ["Tipo", "Contexto", "Técnico", "Conteúdo", "Marca", "Estilo", "Prazo", "Revisão"] as const;

export const OPCOES = {
  objetivos: ["Vender produto", "Divulgar evento", "Explicar serviço", "Fortalecer marca", "Comunicação interna"],
  plataformas: ["Instagram Reels", "Stories", "Feed", "TikTok", "YouTube", "LinkedIn", "Anúncio pago"],
  usosLogo: ["Abertura de vídeos", "Fim de vídeos", "Redes sociais", "Apresentações", "Site"],
  formatos: [
    ["9:16", "Vertical 9:16"],
    ["1:1", "Quadrado 1:1"],
    ["4:5", "Feed 4:5"],
    ["16:9", "Horizontal 16:9"],
  ] as [string, string][],
  revelacoes: ["Montagem por partes", "Desenho do traço", "Revelação com luz", "Transformação de forma", "A critério do designer"],
  vozes: ["Feminina jovem", "Feminina madura", "Masculina jovem", "Masculina madura"],
  estilos: ["Tipografia animada", "Flat 2D", "3D", "Colagem", "Minimalista", "Com personagens"],
  tons: ["Energético", "Divertido", "Sofisticado", "Sério", "Emocional"],
};

export const LOCUCAO = "Com locução";

export function briefingVazio(): Briefing {
  return {
    tipo: null,
    nome: "",
    objetivo: null,
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
    tom: null,
    evitar: "",
    prazo: "padrao",
    aprovador: "",
    email: "",
  };
}

export const pecaDo = (b: Pick<Briefing, "tipo">): Peca | undefined => PECAS.find((p) => p.id === b.tipo);

export const opcoesAudio = (b: Briefing): string[] => {
  if (b.tipo === "logo") return ["Sem som", "Efeito sonoro de assinatura"];
  const base = ["Sem som", "Só trilha", "Trilha e efeitos"];
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
    { descricao: b.duracao ? `${peca.nome} (até ${faixa.ate}s)` : peca.nome, creditos: faixa.creditos },
  ];
  const extras = b.formatos.length - 1;
  if (extras > 0 && tc.formatoExtra)
    linhas.push({ descricao: `${extras} formato${extras > 1 ? "s" : ""} extra`, creditos: extras * tc.formatoExtra });
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
  return {
    formatoExtra: tc.formatoExtra,
    locucao: creditosLocucao(tc, b.duracao),
    roteiro: creditosRoteiro(tc, b.duracao),
    arquivoAberto: tc.arquivoAberto,
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
      else e.push(!b.objetivo && "objetivo", vazio(b.publico) && "publico", !b.plataformas.length && "plataformas");
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
      e.push(!b.estilo.length && "estilo", !b.tom && "tom");
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
  const extra = b.tipo === "logo" ? b.uso[0] : b.objetivo;
  return [peca?.nome, extra].filter(Boolean).join(" · ");
}
