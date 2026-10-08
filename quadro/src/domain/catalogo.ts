// Catálogo de peças e planos. Fonte única usada pelo site público, pelo briefing
// e (no futuro) pela API. Créditos e preços são simbólicos até a precificação final.

export type TipoPeca = "post" | "curto" | "explicativo" | "logo";

export interface Peca {
  id: TipoPeca;
  nome: string;
  descricao: string;
  creditos: number;
  duracoes: number[]; // segundos
  diasUteis: number;
  revisoes: number;
  aceitaLocucao: boolean;
}

export const PECAS: Peca[] = [
  {
    id: "post",
    nome: "Post animado",
    descricao: "Arte de feed que ganha movimento. Ideal para promoções e anúncios rápidos.",
    creditos: 4,
    duracoes: [5, 8, 10],
    diasUteis: 2,
    revisoes: 2,
    aceitaLocucao: false,
  },
  {
    id: "curto",
    nome: "Vídeo curto",
    descricao: "Para Reels, TikTok e Shorts, com cenas encadeadas e ritmo rápido.",
    creditos: 10,
    duracoes: [15, 30],
    diasUteis: 3,
    revisoes: 2,
    aceitaLocucao: true,
  },
  {
    id: "explicativo",
    nome: "Vídeo explicativo",
    descricao: "Apresenta um produto ou serviço passo a passo, com roteiro e narração.",
    creditos: 25,
    duracoes: [30, 60, 90],
    diasUteis: 7,
    revisoes: 3,
    aceitaLocucao: true,
  },
  {
    id: "logo",
    nome: "Animação de logo",
    descricao: "Vinheta curta para abrir ou assinar vídeos e apresentações.",
    creditos: 8,
    duracoes: [3, 5, 8],
    diasUteis: 4,
    revisoes: 2,
    aceitaLocucao: false,
  },
];

export interface Plano {
  id: string;
  nome: string;
  creditosMes: number;
  precoMes: number; // reais
  resumo: string;
  destaque?: boolean;
}

export const PLANOS: Plano[] = [
  {
    id: "essencial",
    nome: "Essencial",
    creditosMes: 20,
    precoMes: 900,
    resumo: "Para quem publica algumas peças por mês.",
  },
  {
    id: "crescimento",
    nome: "Crescimento",
    creditosMes: 50,
    precoMes: 2125,
    resumo: "Para marcas com calendário de conteúdo constante.",
    destaque: true,
  },
  {
    id: "estudio",
    nome: "Estúdio",
    creditosMes: 120,
    precoMes: 4800,
    resumo: "Para agências e times com campanhas simultâneas.",
  },
];

export const planoPorId = (id: string | null | undefined) => PLANOS.find((p) => p.id === id);

/** Preço do crédito avulso (fora do plano). */
export const PRECO_CREDITO_AVULSO = 50;

export const PACOTES_AVULSOS = [10, 25, 50];

export const formatarReais = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
