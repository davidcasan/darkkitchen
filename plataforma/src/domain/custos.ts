// Custo padrão de produção: horas estimadas × valor da hora, mais adicionais e
// retrabalho. Os parâmetros ficam na tabela de preços (editável pelo admin, tela
// Preços); CUSTOS_PADRAO vem da tabela de precificação do CLAUDE.md.
// É uma estimativa: as horas reais de cada pedido não são registradas.

import type { Briefing } from "./briefing";
import type { TipoPeca } from "./catalogo";

/** Horas para peças até uma duração (segundos). */
export interface FaixaHoras {
  ate: number;
  designer: number;
  diretor: number; // curadoria e controle de qualidade
}

export interface Custos {
  valorHoraDesigner: number; // R$
  valorHoraDiretor: number; // R$
  impostosPct: number; // % sobre a receita
  margemAlvoPct: number; // % de margem bruta desejada
  margemRepassePct: number; // margem sobre repasses a terceiros (locução e roteiro), menor que a de produção
  horas: Record<TipoPeca, FaixaHoras[]>;
  horasFormatoExtra: number; // por formato além do primeiro (designer)
  horasArquivoAberto: number; // organizar e entregar o .aep (designer)
  horasTrilha: number; // escolher e editar a trilha (designer)
  horasTrilhaEfeitos: number; // trilha com efeitos sonoros (designer), no lugar de horasTrilha
  horasLegendas: number; // legendar a peça (designer)
  roteiro: { ate30: number; ate90: number }; // valor do roteirista por duração do vídeo, em R$ (repasse)
  locucao: { ate30: number; ate60: number; ate90: number }; // repasse ao locutor, em R$
  retrabalhoPct: number; // % das horas-base do designer, por rodada de ajuste ou reprovação
  retrabalhoHorasDiretor: number; // nova curadoria, por rodada
}

export const CUSTOS_PADRAO: Custos = {
  valorHoraDesigner: 60,
  valorHoraDiretor: 90,
  impostosPct: 15,
  margemAlvoPct: 40,
  margemRepassePct: 15,
  horas: {
    // Uma faixa por duração do catálogo: quanto mais longa, mais horas.
    post: [
      { ate: 5, designer: 2, diretor: 0.3 },
      { ate: 8, designer: 2.5, diretor: 0.4 },
      { ate: 10, designer: 3, diretor: 0.5 },
    ],
    curto: [
      { ate: 15, designer: 5, diretor: 0.75 },
      { ate: 30, designer: 8, diretor: 1 },
    ],
    explicativo: [
      { ate: 30, designer: 14, diretor: 2 },
      { ate: 60, designer: 24, diretor: 3 },
      { ate: 90, designer: 34, diretor: 4 },
    ],
    logo: [
      { ate: 3, designer: 4, diretor: 0.75 },
      { ate: 5, designer: 6, diretor: 1 },
      { ate: 8, designer: 9, diretor: 1.2 },
    ],
  },
  horasFormatoExtra: 0.5,
  horasArquivoAberto: 0.5,
  horasTrilha: 0.5,
  horasTrilhaEfeitos: 1.5,
  horasLegendas: 0.5,
  roteiro: { ate30: 140, ate90: 420 },
  locucao: { ate30: 340, ate60: 510, ate90: 680 },
  retrabalhoPct: 25,
  retrabalhoHorasDiretor: 0.25,
};

/** Faixa de horas que vale para a duração (a primeira que comporta; senão a última). */
export const faixaPara = (c: Custos, tipo: TipoPeca, duracao: number) => {
  const faixas = c.horas[tipo];
  return faixas.find((f) => duracao <= f.ate) ?? faixas[faixas.length - 1];
};

export const custoDaFaixa = (c: Custos, f: Pick<FaixaHoras, "designer" | "diretor">) =>
  f.designer * c.valorHoraDesigner + f.diretor * c.valorHoraDiretor;

export interface CustoPadrao {
  horasDesigner: number;
  horasDiretor: number;
  repasses: number;
  total: number;
}

export function custoPadrao(b: Briefing, c: Custos, rodadasRetrabalho = 0): CustoPadrao {
  if (!b.tipo) return { horasDesigner: 0, horasDiretor: 0, repasses: 0, total: 0 };
  const duracao = b.duracao ?? 0;
  const base = faixaPara(c, b.tipo, duracao);

  let horasDesigner = base.designer;
  let horasDiretor = base.diretor;
  horasDesigner += Math.max(0, b.formatos.length - 1) * c.horasFormatoExtra;
  if (b.aberto) horasDesigner += c.horasArquivoAberto;
  if (b.audio === "Só trilha") horasDesigner += c.horasTrilha;
  if (b.audio === "Trilha e efeitos" || b.audio === "Efeito sonoro") horasDesigner += c.horasTrilhaEfeitos;
  if (b.legendas === "Sim" && b.tipo !== "logo") horasDesigner += c.horasLegendas;
  horasDesigner += rodadasRetrabalho * base.designer * (c.retrabalhoPct / 100);
  horasDiretor += rodadasRetrabalho * c.retrabalhoHorasDiretor;
  // Repasses a terceiros: locutor e roteirista, com valor fixo por duração.
  const locucao =
    b.audio === "Com locução" ? (duracao <= 30 ? c.locucao.ate30 : duracao <= 60 ? c.locucao.ate60 : c.locucao.ate90) : 0;
  const roteiro = b.semRoteiro && b.tipo !== "logo" ? (duracao <= 30 ? c.roteiro.ate30 : c.roteiro.ate90) : 0;
  const repasses = locucao + roteiro;

  const total = horasDesigner * c.valorHoraDesigner + horasDiretor * c.valorHoraDiretor + repasses;
  return { horasDesigner, horasDiretor, repasses, total: Math.round(total * 100) / 100 };
}
