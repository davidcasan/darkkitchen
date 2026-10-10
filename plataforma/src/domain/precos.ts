// Tabela de preços. O admin define o VALOR-BASE DO CRÉDITO (R$) e os custos de
// produção; o sistema calcula quantos créditos cada atividade precisa para cobrir
// custo + impostos + meta de margem. Com isso o admin calibra os planos (pacotes
// de créditos), que são a única forma de o cliente comprar créditos.
// Fica no banco (tela Preços); PRECOS_PADRAO é o ponto de partida e o "restaurar padrão".

import { PECAS, type Peca, type TipoPeca } from "./catalogo";
import { CUSTOS_PADRAO, type Custos, custoDaFaixa, faixaPara } from "./custos";

/** Prazo padrão e rodadas de ajuste incluídas de cada tipo de peça. */
export interface PrazoPeca {
  diasUteis: number;
  revisoes: number;
}

export interface Plano {
  id: string;
  nome: string;
  creditosMes: number;
  precoMes: number; // reais
  resumo: string;
  destaque: boolean;
  ativo: boolean; // inativo: some do site e do cadastro, mas quem já assina continua
}

export interface TabelaPrecos {
  valorCredito: number; // R$ por crédito: base para converter custo em créditos
  pecas: Record<TipoPeca, PrazoPeca>;
  urgenciaPct: number; // acréscimo em créditos para entrega urgente, em %
  planos: Plano[];
  custos: Custos;
}

export const PRECOS_PADRAO: TabelaPrecos = {
  valorCredito: 50,
  pecas: {
    post: { diasUteis: 2, revisoes: 2 },
    curto: { diasUteis: 3, revisoes: 2 },
    explicativo: { diasUteis: 7, revisoes: 3 },
    logo: { diasUteis: 4, revisoes: 2 },
  },
  urgenciaPct: 50,
  planos: [
    { id: "essencial", nome: "Essencial", creditosMes: 20, precoMes: 900, resumo: "Para quem publica algumas peças por mês.", destaque: false, ativo: true },
    { id: "crescimento", nome: "Crescimento", creditosMes: 50, precoMes: 2125, resumo: "Para marcas com calendário de conteúdo constante.", destaque: true, ativo: true },
    { id: "estudio", nome: "Estúdio", creditosMes: 120, precoMes: 4800, resumo: "Para agências e times com campanhas simultâneas.", destaque: false, ativo: true },
  ],
  custos: CUSTOS_PADRAO,
};

// ---------- Créditos calculados a partir do custo ----------

/** Créditos para cobrir um custo em R$ com a margem desejada, depois dos impostos. */
export function creditosPara(custo: number, t: TabelaPrecos, margemPct = t.custos.margemAlvoPct) {
  if (custo <= 0) return 0;
  const fator = 1 - t.custos.impostosPct / 100 - margemPct / 100;
  if (fator <= 0 || t.valorCredito <= 0) return 0;
  return Math.ceil(custo / fator / t.valorCredito - 1e-9);
}

export interface FaixaCreditos {
  ate: number;
  custo: number; // R$ de produção da peça base
  creditos: number;
  revisaoExtra: number; // créditos de uma rodada de ajuste além das incluídas
}

export interface TabelaCreditos {
  pecas: Record<TipoPeca, FaixaCreditos[]>;
  formatoExtra: number;
  roteiro: { ate30: number; ate90: number };
  arquivoAberto: number;
  trilha: number;
  trilhaEfeitos: number;
  legendas: number;
  locucao: { ate30: number; ate60: number; ate90: number };
}

/** Quantos créditos cada atividade custa, com o valor do crédito e os custos atuais. */
export function tabelaCreditos(t: TabelaPrecos): TabelaCreditos {
  const c = t.custos;
  const pecas = {} as TabelaCreditos["pecas"];
  for (const p of PECAS) {
    pecas[p.id] = c.horas[p.id].map((f) => {
      const custo = custoDaFaixa(c, f);
      const retrabalho = f.designer * (c.retrabalhoPct / 100) * c.valorHoraDesigner + c.retrabalhoHorasDiretor * c.valorHoraDiretor;
      return { ate: f.ate, custo, creditos: Math.max(1, creditosPara(custo, t)), revisaoExtra: creditosPara(retrabalho, t) };
    });
  }
  const horaDesigner = (h: number) => creditosPara(h * c.valorHoraDesigner, t);
  const repasse = (r: number) => creditosPara(r, t, c.margemRepassePct);
  return {
    pecas,
    formatoExtra: horaDesigner(c.horasFormatoExtra),
    roteiro: { ate30: repasse(c.roteiro.ate30), ate90: repasse(c.roteiro.ate90) },
    arquivoAberto: horaDesigner(c.horasArquivoAberto),
    trilha: horaDesigner(c.horasTrilha),
    trilhaEfeitos: horaDesigner(c.horasTrilhaEfeitos),
    legendas: horaDesigner(c.horasLegendas),
    locucao: { ate30: repasse(c.locucao.ate30), ate60: repasse(c.locucao.ate60), ate90: repasse(c.locucao.ate90) },
  };
}

/** Faixa de créditos da peça para a duração (sem duração ainda: a menor). */
export function faixaCreditos(tc: TabelaCreditos, tipo: TipoPeca, duracao: number | null): FaixaCreditos {
  const faixas = tc.pecas[tipo];
  if (!duracao) return faixas[0];
  return faixas.find((f) => duracao <= f.ate) ?? faixas[faixas.length - 1];
}

export const creditosLocucao = (tc: TabelaCreditos, duracao: number | null) =>
  (duracao ?? 0) <= 30 ? tc.locucao.ate30 : (duracao ?? 0) <= 60 ? tc.locucao.ate60 : tc.locucao.ate90;

export const creditosRoteiro = (tc: TabelaCreditos, duracao: number | null) =>
  (duracao ?? 0) <= 30 ? tc.roteiro.ate30 : tc.roteiro.ate90;

/** Peça com prazo, revisões e o preço "a partir de" (menor faixa de duração). */
export type PecaComPreco = Peca & PrazoPeca & { creditos: number };

export const pecasComPrecos = (t: TabelaPrecos): PecaComPreco[] => {
  const tc = tabelaCreditos(t);
  return PECAS.map((p) => ({ ...p, ...t.pecas[p.id], creditos: tc.pecas[p.id][0].creditos }));
};

export const planoPorId = (t: TabelaPrecos, id: string | null | undefined) => t.planos.find((p) => p.id === id);

export const planosAtivos = (t: TabelaPrecos) => t.planos.filter((p) => p.ativo);

/**
 * Plano Personalizado (out/2026): sem valor fixo. O admin combina com cada cliente
 * os créditos e o valor por mês, que ficam na assinatura dele. Não fica na tabela
 * de planos; o identificador é reservado.
 */
export const PLANO_PERSONALIZADO = "personalizado";

export const planoPersonalizado = (precoMes: number, creditosMes: number): Plano => ({
  id: PLANO_PERSONALIZADO,
  nome: "Personalizado",
  creditosMes,
  precoMes,
  resumo: "Créditos e valor combinados de acordo com a sua necessidade.",
  destaque: false,
  ativo: false, // não se assina sozinho: o admin aplica na conta do cliente
});

/** Identificador estável para um plano novo, a partir do nome. */
export const idDoPlano = (nome: string, existentes: string[]) => {
  const base =
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "plano";
  let id = base;
  for (let i = 2; existentes.includes(id) || id === PLANO_PERSONALIZADO; i++) id = `${base}-${i}`;
  return id;
};

// Reexportado para quem precisa da faixa de horas junto com os créditos.
export { faixaPara };

// ---------- Validação ----------

const inteiro = (v: unknown, min: number, max: number, nome: string, erros: string[]) => {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    erros.push(`${nome}: use um número inteiro entre ${min} e ${max}.`);
    return min;
  }
  return n;
};

const decimal = (v: unknown, min: number, max: number, nome: string, erros: string[]) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) {
    erros.push(`${nome}: use um valor entre ${min} e ${max}.`);
    return min;
  }
  return Math.round(n * 100) / 100;
};

/** Confere e limpa uma tabela vinda da tela. Devolve os erros em português, prontos para mostrar. */
export function validarTabela(raw: unknown): { tabela: TabelaPrecos; erros: string[] } {
  const erros: string[] = [];
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<TabelaPrecos>;
  const pecas = {} as Record<TipoPeca, PrazoPeca>;
  for (const p of PECAS) {
    const x = (r.pecas?.[p.id] ?? PRECOS_PADRAO.pecas[p.id]) as Partial<PrazoPeca>;
    pecas[p.id] = {
      diasUteis: inteiro(x.diasUteis ?? PRECOS_PADRAO.pecas[p.id].diasUteis, 1, 60, `${p.nome} (prazo)`, erros),
      revisoes: inteiro(x.revisoes ?? PRECOS_PADRAO.pecas[p.id].revisoes, 0, 10, `${p.nome} (revisões)`, erros),
    };
  }

  const planosRaw = Array.isArray(r.planos) ? r.planos : [];
  const planos: Plano[] = [];
  for (const [i, x] of planosRaw.entries()) {
    const nome = String(x?.nome ?? "").trim().slice(0, 40);
    if (nome.length < 2) erros.push(`Plano ${i + 1}: dê um nome.`);
    planos.push({
      id: String(x?.id ?? "").trim() || idDoPlano(nome, planos.map((p) => p.id)),
      nome,
      creditosMes: inteiro(x?.creditosMes, 1, 100000, `Plano ${nome || i + 1} (créditos/mês)`, erros),
      precoMes: decimal(x?.precoMes, 1, 1000000, `Plano ${nome || i + 1} (preço)`, erros),
      resumo: String(x?.resumo ?? "").trim().slice(0, 140),
      destaque: Boolean(x?.destaque),
      ativo: x?.ativo !== false,
    });
  }
  if (new Set(planos.map((p) => p.id)).size !== planos.length) erros.push("Há dois planos com o mesmo identificador.");
  if (planos.some((p) => p.id === PLANO_PERSONALIZADO))
    erros.push('"personalizado" é reservado para o plano Personalizado, que o admin aplica em cada cliente.');
  if (!planos.some((p) => p.ativo)) erros.push("Deixe pelo menos um plano ativo.");
  if (planos.filter((p) => p.destaque && p.ativo).length > 1) erros.push("Marque no máximo um plano como destaque.");

  const custos = validarCustos(r.custos, erros);
  if (custos.impostosPct + custos.margemAlvoPct >= 95)
    erros.push("Impostos + meta de margem precisam somar menos de 95%, senão nenhum preço cobre o custo.");
  if (custos.impostosPct + custos.margemRepassePct >= 95) erros.push("Impostos + margem sobre repasses precisam somar menos de 95%.");

  return {
    tabela: {
      valorCredito: decimal(r.valorCredito ?? PRECOS_PADRAO.valorCredito, 0.01, 100000, "Valor do crédito", erros),
      pecas,
      urgenciaPct: inteiro(r.urgenciaPct ?? PRECOS_PADRAO.urgenciaPct, 0, 500, "Urgência (%)", erros),
      planos,
      custos,
    },
    erros,
  };
}

/**
 * Confere as premissas de custo. As faixas de duração vêm do padrão (uma por duração
 * do catálogo); só as horas são editáveis. As horas salvas são casadas pela duração,
 * então uma faixa nova entra com as horas do padrão sem bagunçar as já salvas.
 */
function validarCustos(raw: unknown, erros: string[]): Custos {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<Custos>;
  const p = CUSTOS_PADRAO;
  const n = (v: unknown, padrao: number, max: number, nome: string) => decimal(v ?? padrao, 0, max, nome, erros);
  const horas = {} as Custos["horas"];
  for (const peca of PECAS) {
    horas[peca.id] = p.horas[peca.id].map((f) => {
      const x = c.horas?.[peca.id]?.find((s) => s?.ate === f.ate);
      return {
        ate: f.ate,
        designer: n(x?.designer, f.designer, 500, `${peca.nome} até ${f.ate}s (horas de designer)`),
        diretor: n(x?.diretor, f.diretor, 100, `${peca.nome} até ${f.ate}s (horas de diretor)`),
      };
    });
  }
  for (const peca of PECAS)
    horas[peca.id].forEach((f, i) => {
      const ant = horas[peca.id][i - 1];
      if (ant && f.designer + f.diretor <= ant.designer + ant.diretor)
        erros.push(`${peca.nome}: a duração de ${f.ate}s precisa ter mais horas que a de ${ant.ate}s (quanto mais longa, mais cara).`);
    });
  return {
    valorHoraDesigner: n(c.valorHoraDesigner, p.valorHoraDesigner, 10000, "Valor da hora do designer"),
    valorHoraDiretor: n(c.valorHoraDiretor, p.valorHoraDiretor, 10000, "Valor da hora do diretor"),
    impostosPct: n(c.impostosPct, p.impostosPct, 90, "Impostos e taxas (%)"),
    margemAlvoPct: n(c.margemAlvoPct, p.margemAlvoPct, 90, "Meta de margem (%)"),
    margemRepassePct: n(c.margemRepassePct, p.margemRepassePct, 90, "Margem sobre repasses (%)"),
    horas,
    horasFormatoExtra: n(c.horasFormatoExtra, p.horasFormatoExtra, 100, "Horas por formato extra"),
    horasArquivoAberto: n(c.horasArquivoAberto, p.horasArquivoAberto, 100, "Horas do arquivo aberto"),
    horasTrilha: n(c.horasTrilha, p.horasTrilha, 100, "Horas da trilha"),
    horasTrilhaEfeitos: n(c.horasTrilhaEfeitos, p.horasTrilhaEfeitos, 100, "Horas da trilha com efeitos"),
    horasLegendas: n(c.horasLegendas, p.horasLegendas, 100, "Horas das legendas"),
    roteiro: {
      ate30: n(c.roteiro?.ate30, p.roteiro.ate30, 100000, "Roteiro até 30s (R$)"),
      ate90: n(c.roteiro?.ate90, p.roteiro.ate90, 100000, "Roteiro até 90s (R$)"),
    },
    locucao: {
      ate30: n(c.locucao?.ate30, p.locucao.ate30, 100000, "Locução até 30s (R$)"),
      ate60: n(c.locucao?.ate60, p.locucao.ate60, 100000, "Locução até 60s (R$)"),
      ate90: n(c.locucao?.ate90, p.locucao.ate90, 100000, "Locução até 90s (R$)"),
    },
    retrabalhoPct: n(c.retrabalhoPct, p.retrabalhoPct, 200, "Retrabalho (% das horas do designer)"),
    retrabalhoHorasDiretor: n(c.retrabalhoHorasDiretor, p.retrabalhoHorasDiretor, 100, "Retrabalho (horas do diretor)"),
  };
}
