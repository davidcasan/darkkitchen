import "server-only";
import { type Briefing, atualizarBriefing } from "@/domain/briefing";
import { PECAS, type TipoPeca } from "@/domain/catalogo";
import { custoPadrao } from "@/domain/custos";
import { um, varios } from "../db";
import { type CodigoPeriodo, intervalo } from "./relatorios";
import { assinaturaDo, planoDaAssinatura } from "./assinaturas";
import { precos } from "./precos";

// Análise > Usuários (out/2026; rota /equipe/clientes): o que cada cliente contrata, onde gasta os créditos, o perfil
// de uso e quão lucrativo ele é. Tudo estimado com a mesma base dos Relatórios:
// - receita: faturas pagas no período;
// - custo: custo padrão (horas previstas da tela Preços + repasses) dos pedidos concluídos no
//   período, com as rodadas que aconteceram (ajustes do cliente + reprovações internas);
// - resultado: receita − impostos − custo. Créditos que expiram sem uso viram margem;
// - valor do crédito do cliente: tudo o que ele pagou ÷ créditos que recebeu do plano (desde o início).

export interface Etiqueta {
  rotulo: string;
  tom: "ok" | "acao" | "parado" | "neutro" | "andamento";
}

export interface ResumoCliente {
  id: number;
  nome: string;
  empresa: string | null;
  email: string;
  ativo: number;
  plano: string | null;
  receita: number;
  creditosRecebidos: number; // do plano (assinatura/compra) no período
  creditosBonus: number; // ajustes positivos do admin
  creditosUsados: number; // pedidos + rodadas extras, líquidos de estornos
  creditosDevolvidos: number;
  creditosExpirados: number;
  saldo: number;
  pedidos: number; // criados no período (sem cancelados)
  cancelados: number;
  concluidos: number;
  pecaPreferida: string | null;
  ajustesPorPedido: number | null;
  primeiraPct: number | null;
  urgentesPct: number | null;
  rejeicoes: number;
  custo: number;
  impostos: number;
  resultado: number;
  margemPct: number | null;
  valorCredito: number;
  perfil: Etiqueta[];
}

export interface DetalheCliente extends ResumoCliente {
  gastos: { categoria: string; creditos: number }[];
  porTipo: { tipo: TipoPeca; nome: string; pedidos: number; creditos: number; custo: number; margem: number }[];
  lista: {
    id: number;
    codigo: string;
    titulo: string;
    tipo: TipoPeca;
    duracao: number | null;
    status: string;
    criado_em: string;
    creditos: number;
    rodadas: number;
    reprovacoes: number;
    urgente: boolean;
    custo: number | null; // só concluídos
    margem: number | null;
  }[];
  meses: { mes: string; receita: number; custo: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const nomePeca = (t: string) => PECAS.find((p) => p.id === t)?.nome ?? t;

/** Categoria de cada linha do detalhamento de créditos do pedido (a 1ª é sempre a peça). */
function categoria(descricao: string, indice: number) {
  if (indice === 0) return "Peça (produção)";
  if (/formato/i.test(descricao)) return "Formatos extras";
  if (/locução/i.test(descricao)) return "Locução";
  if (/roteiro/i.test(descricao)) return "Roteiro";
  if (/trilha|efeito sonoro/i.test(descricao)) return "Trilha e efeitos";
  if (/legenda/i.test(descricao)) return "Legendas";
  if (/arquivo aberto/i.test(descricao)) return "Arquivo aberto";
  if (/urgente/i.test(descricao)) return "Urgência";
  if (/rodada/i.test(descricao)) return "Rodadas garantidas no pedido";
  return "Outros";
}

interface PedidoBruto {
  id: number;
  codigo: string;
  titulo: string;
  tipo: TipoPeca;
  briefing: string;
  creditos: number;
  creditos_detalhe: string | null;
  status: string;
  urgente: number;
  revisoes_usadas: number;
  tentativas_internas: number;
  criado_em: string;
  concluido_em: string | null;
}

function calcular(id: number, periodo: CodigoPeriodo, detalhar: boolean): DetalheCliente | null {
  const u = um<{ id: number; nome: string; empresa: string | null; email: string; ativo: number }>(
    "SELECT id, nome, empresa, email, ativo FROM usuarios WHERE id = ? AND papel = 'cliente'",
    id,
  );
  if (!u) return null;
  const { de, ate } = intervalo(periodo);
  const tabela = precos();
  const custos = tabela.custos;
  const impostosPct = custos.impostosPct / 100;

  const historico = um<{ reais: number; recebidos: number }>(
    `SELECT (SELECT COALESCE(SUM(valor_centavos), 0) / 100.0 FROM faturas WHERE usuario_id = ? AND status = 'paga') reais,
            (SELECT COALESCE(SUM(quantidade), 0) FROM creditos WHERE usuario_id = ? AND tipo IN ('assinatura','compra')) recebidos`,
    id,
    id,
  )!;
  const valorCredito = historico.recebidos > 0 && historico.reais > 0 ? historico.reais / historico.recebidos : tabela.valorCredito;

  const receita =
    um<{ v: number }>(
      `SELECT COALESCE(SUM(valor_centavos), 0) / 100.0 v FROM faturas
       WHERE usuario_id = ? AND status = 'paga' AND COALESCE(confirmada_em, criado_em) BETWEEN ? AND ?`,
      id,
      de,
      ate,
    )?.v ?? 0;
  const soma = (tipos: string, sinal: "pos" | "neg" | "todos" = "todos") =>
    um<{ v: number }>(
      `SELECT COALESCE(SUM(quantidade), 0) v FROM creditos WHERE usuario_id = ? AND tipo IN (${tipos})
       ${sinal === "pos" ? "AND quantidade > 0" : sinal === "neg" ? "AND quantidade < 0" : ""} AND criado_em BETWEEN ? AND ?`,
      id,
      de,
      ate,
    )?.v ?? 0;
  const creditosRecebidos = soma("'assinatura','compra'");
  const creditosBonus = soma("'ajuste'", "pos");
  const creditosDevolvidos = soma("'estorno'", "pos");
  const creditosUsados = -soma("'pedido','revisao_extra'") - creditosDevolvidos;
  const creditosExpirados = -soma("'expiracao'");
  const saldo = um<{ v: number }>("SELECT COALESCE(SUM(quantidade), 0) v FROM creditos WHERE usuario_id = ?", id)?.v ?? 0;

  const pedidos = varios<PedidoBruto>(
    `SELECT p.id, p.codigo, p.titulo, p.tipo, p.briefing, p.creditos, p.creditos_detalhe, p.status, p.urgente,
            p.revisoes_usadas, p.tentativas_internas, p.criado_em,
            (SELECT MAX(criado_em) FROM eventos e WHERE e.pedido_id = p.id AND e.para = 'aprovado') concluido_em
     FROM pedidos p WHERE p.cliente_id = ? ORDER BY p.criado_em DESC`,
    id,
  );
  const noPeriodo = (s: string | null) => !!s && s >= de && s <= ate;
  const criados = pedidos.filter((p) => noPeriodo(p.criado_em));
  const validos = criados.filter((p) => p.status !== "cancelado");
  const concluidosLista = pedidos.filter((p) => p.status === "aprovado" && noPeriodo(p.concluido_em));
  const extraPorPedido = new Map(
    varios<{ pedido_id: number; v: number }>(
      "SELECT pedido_id, -SUM(quantidade) v FROM creditos WHERE usuario_id = ? AND tipo = 'revisao_extra' GROUP BY pedido_id",
      id,
    ).map((x) => [x.pedido_id, x.v]),
  );

  const custoDe = (p: PedidoBruto) => {
    const b: Briefing = atualizarBriefing(JSON.parse(p.briefing));
    return custoPadrao(b, custos, p.revisoes_usadas + p.tentativas_internas).total;
  };
  const margemDe = (p: PedidoBruto, custo: number) =>
    (p.creditos + (extraPorPedido.get(p.id) ?? 0)) * valorCredito * (1 - impostosPct) - custo;

  let custo = 0;
  const custoPorPedido = new Map<number, number>();
  for (const p of concluidosLista) {
    const c = custoDe(p);
    custoPorPedido.set(p.id, c);
    custo += c;
  }
  const impostos = receita * impostosPct;
  const resultado = receita - impostos - custo;

  const contagemTipo = new Map<string, number>();
  for (const p of validos) contagemTipo.set(p.tipo, (contagemTipo.get(p.tipo) ?? 0) + 1);
  const preferida = [...contagemTipo.entries()].sort((a, b) => b[1] - a[1])[0];
  const ajustesPorPedido = concluidosLista.length ? concluidosLista.reduce((s, p) => s + p.revisoes_usadas, 0) / concluidosLista.length : null;
  const primeiraPct = concluidosLista.length
    ? (concluidosLista.filter((p) => p.revisoes_usadas === 0).length / concluidosLista.length) * 100
    : null;
  const urgentesPct = validos.length ? (validos.filter((p) => p.urgente).length / validos.length) * 100 : null;
  const rejeicoes =
    um<{ n: number }>(
      `SELECT COUNT(*) n FROM eventos e JOIN pedidos p ON p.id = e.pedido_id
       WHERE p.cliente_id = ? AND e.tipo = 'cliente_rejeitou' AND e.criado_em BETWEEN ? AND ?`,
      id,
      de,
      ate,
    )?.n ?? 0;
  const margemPct = receita > 0 ? (resultado / receita) * 100 : null;
  const assinatura = assinaturaDo(id);
  const plano = assinatura && assinatura.status !== "cancelada" ? (planoDaAssinatura(assinatura)?.nome ?? null) : null;

  // Perfil: etiquetas a partir do comportamento no período.
  const perfil: Etiqueta[] = [];
  if (preferida) perfil.push({ rotulo: `Pede mais: ${nomePeca(preferida[0])}`, tom: "neutro" });
  if (validos.length >= 4) perfil.push({ rotulo: "Alto volume", tom: "ok" });
  if (creditosRecebidos > 0 && creditosUsados >= creditosRecebidos * 0.9) perfil.push({ rotulo: "Usa todo o plano", tom: "ok" });
  if (creditosRecebidos > 0 && creditosUsados < creditosRecebidos * 0.5) perfil.push({ rotulo: "Subutiliza o plano", tom: "acao" });
  if (creditosExpirados > 0) perfil.push({ rotulo: "Deixa créditos expirarem", tom: "acao" });
  if (ajustesPorPedido !== null && concluidosLista.length >= 2 && ajustesPorPedido >= 1.5) perfil.push({ rotulo: "Pede muitos ajustes", tom: "acao" });
  if (primeiraPct !== null && concluidosLista.length >= 2 && primeiraPct >= 60) perfil.push({ rotulo: "Aprova de primeira", tom: "ok" });
  if (urgentesPct !== null && validos.length >= 2 && urgentesPct >= 30) perfil.push({ rotulo: "Urgente com frequência", tom: "andamento" });
  const comExtras = validos.filter((p) => {
    try {
      return (JSON.parse(p.creditos_detalhe ?? "[]") as { descricao: string }[]).some((l, i) => i > 0 && !/urgente/i.test(l.descricao));
    } catch {
      return false;
    }
  }).length;
  if (validos.length >= 2 && comExtras / validos.length >= 0.5) perfil.push({ rotulo: "Contrata adicionais", tom: "ok" });
  if (rejeicoes > 0) perfil.push({ rotulo: "Já rejeitou peça", tom: "parado" });
  if (receita > 0 && !validos.length) perfil.push({ rotulo: "Paga e não pede", tom: "acao" });
  if (margemPct !== null) {
    if (margemPct < 0) perfil.push({ rotulo: "Prejuízo", tom: "parado" });
    else if (margemPct < 10) perfil.push({ rotulo: "Margem baixa", tom: "acao" });
    else if (margemPct >= 25) perfil.push({ rotulo: "Lucrativo", tom: "ok" });
  }

  const resumo: DetalheCliente = {
    ...u,
    plano,
    receita: r2(receita),
    creditosRecebidos,
    creditosBonus,
    creditosUsados,
    creditosDevolvidos,
    creditosExpirados,
    saldo,
    pedidos: validos.length,
    cancelados: criados.length - validos.length,
    concluidos: concluidosLista.length,
    pecaPreferida: preferida ? nomePeca(preferida[0]) : null,
    ajustesPorPedido,
    primeiraPct,
    urgentesPct,
    rejeicoes,
    custo: r2(custo),
    impostos: r2(impostos),
    resultado: r2(resultado),
    margemPct,
    valorCredito,
    perfil,
    gastos: [],
    porTipo: [],
    lista: [],
    meses: [],
  };
  if (!detalhar) return resumo;

  // Onde gasta os créditos: detalhamento dos pedidos do período + rodadas pagas depois.
  const gastos = new Map<string, number>();
  for (const p of validos) {
    let linhas: { descricao: string; creditos: number }[] = [];
    try {
      linhas = JSON.parse(p.creditos_detalhe ?? "[]");
    } catch {}
    if (!linhas.length) linhas = [{ descricao: nomePeca(p.tipo), creditos: p.creditos }];
    linhas.forEach((l, i) => gastos.set(categoria(l.descricao, i), (gastos.get(categoria(l.descricao, i)) ?? 0) + l.creditos));
  }
  const extrasDepois = -soma("'revisao_extra'");
  if (extrasDepois > 0) gastos.set("Rodadas extras pedidas depois", extrasDepois);
  resumo.gastos = [...gastos.entries()].map(([categoria, creditos]) => ({ categoria, creditos })).sort((a, b) => b.creditos - a.creditos);

  const porTipo = new Map<TipoPeca, DetalheCliente["porTipo"][number]>();
  for (const p of validos) {
    const t = porTipo.get(p.tipo) ?? { tipo: p.tipo, nome: nomePeca(p.tipo), pedidos: 0, creditos: 0, custo: 0, margem: 0 };
    t.pedidos++;
    t.creditos += p.creditos + (extraPorPedido.get(p.id) ?? 0);
    const c = custoPorPedido.get(p.id);
    if (c !== undefined) {
      t.custo += c;
      t.margem += margemDe(p, c);
    }
    porTipo.set(p.tipo, t);
  }
  resumo.porTipo = [...porTipo.values()].map((t) => ({ ...t, custo: r2(t.custo), margem: r2(t.margem) })).sort((a, b) => b.pedidos - a.pedidos);

  resumo.lista = criados.concat(concluidosLista.filter((p) => !criados.includes(p))).map((p) => {
    const c = custoPorPedido.get(p.id) ?? null;
    return {
      id: p.id,
      codigo: p.codigo,
      titulo: p.titulo,
      tipo: p.tipo,
      duracao: atualizarBriefing(JSON.parse(p.briefing)).duracao,
      status: p.status,
      criado_em: p.criado_em,
      creditos: p.creditos + (extraPorPedido.get(p.id) ?? 0),
      rodadas: p.revisoes_usadas,
      reprovacoes: p.tentativas_internas,
      urgente: Boolean(p.urgente),
      custo: c === null ? null : r2(c),
      margem: c === null ? null : r2(margemDe(p, c)),
    };
  });

  // Últimos 12 meses: receita paga e custo dos pedidos concluídos (mês em UTC, como os Relatórios).
  const receitaMes = new Map(
    varios<{ mes: string; v: number }>(
      `SELECT substr(COALESCE(confirmada_em, criado_em), 1, 7) mes, SUM(valor_centavos) / 100.0 v FROM faturas
       WHERE usuario_id = ? AND status = 'paga' GROUP BY mes`,
      id,
    ).map((x) => [x.mes, x.v]),
  );
  const custoMes = new Map<string, number>();
  for (const p of pedidos)
    if (p.status === "aprovado" && p.concluido_em) {
      const mes = p.concluido_em.slice(0, 7);
      custoMes.set(mes, (custoMes.get(mes) ?? 0) + custoDe(p));
    }
  const agora = new Date();
  for (let i = 11; i >= 0; i--) {
    const mes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i, 1)).toISOString().slice(0, 7);
    resumo.meses.push({ mes, receita: r2(receitaMes.get(mes) ?? 0), custo: r2(custoMes.get(mes) ?? 0) });
  }
  return resumo;
}

/** Todos os clientes com atividade no período (ou ativos), do mais lucrativo para o menos. */
export function clientesFinanceiro(periodo: CodigoPeriodo): ResumoCliente[] {
  const ids = varios<{ id: number }>("SELECT id FROM usuarios WHERE papel = 'cliente' ORDER BY nome");
  return ids
    .map(({ id }) => calcular(id, periodo, false)!)
    .filter((c) => c.ativo || c.receita > 0 || c.pedidos > 0 || c.concluidos > 0)
    .sort((a, b) => b.resultado - a.resultado);
}

export const detalheClienteFinanceiro = (id: number, periodo: CodigoPeriodo) => calcular(id, periodo, true);
