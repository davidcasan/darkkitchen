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
    descricao: "Arte pra feed que ganha movimento. Ideal para promoções e anúncios rápidos.",
    duracoes: [5, 8, 10],
    aceitaLocucao: false,
  },
  {
    id: "curto",
    nome: "Vídeo curto",
    descricao: "A solução para divulgar seu produto ou serviço com mais profundidade.",
    duracoes: [15, 30],
    aceitaLocucao: true,
  },
  {
    id: "explicativo",
    nome: "Vídeo explicativo",
    descricao: "Seu conteúdo explicado no detalhe. Ideal para produtos de alto valor.",
    duracoes: [30, 60, 90],
    aceitaLocucao: true,
  },
  {
    id: "logo",
    nome: "Animação de logo",
    descricao: "Vinheta para abrir ou assinar vídeos e apresentações.",
    duracoes: [3, 5, 8],
    aceitaLocucao: false,
  },
];

/** Valores inteiros sem centavos (R$ 1.000); com centavos, mostra os centavos (R$ 2.750,50). */
export const formatarReais = (valor: number) => {
  const inteiro = Math.round(valor * 100) % 100 === 0;
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: inteiro ? 0 : 2,
    maximumFractionDigits: inteiro ? 0 : 2,
  });
};
