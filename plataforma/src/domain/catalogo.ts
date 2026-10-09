// Catálogo de peças: o que cada tipo é (nome, descrição, durações possíveis).
// Os números que mudam com o negócio (créditos, prazo, revisões, planos) ficam
// na tabela de preços (domain/precos.ts), editada pelo admin.

export type TipoPeca = "post" | "curto" | "explicativo" | "logo";

export interface Peca {
  id: TipoPeca;
  nome: string;
  descricao: string;
  duracoes: number[]; // segundos
  aceitaLocucao: boolean;
}

export const PECAS: Peca[] = [
  {
    id: "post",
    nome: "Post animado",
    descricao: "Arte de feed que ganha movimento. Ideal para promoções e anúncios rápidos.",
    duracoes: [5, 8, 10],
    aceitaLocucao: false,
  },
  {
    id: "curto",
    nome: "Vídeo curto",
    descricao: "Para Reels, TikTok e Shorts, com cenas encadeadas e ritmo rápido.",
    duracoes: [15, 30],
    aceitaLocucao: true,
  },
  {
    id: "explicativo",
    nome: "Vídeo explicativo",
    descricao: "Apresenta um produto ou serviço passo a passo, com roteiro e narração.",
    duracoes: [30, 60, 90],
    aceitaLocucao: true,
  },
  {
    id: "logo",
    nome: "Animação de logo",
    descricao: "Vinheta curta para abrir ou assinar vídeos e apresentações.",
    duracoes: [3, 5, 8],
    aceitaLocucao: false,
  },
];

export const formatarReais = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
