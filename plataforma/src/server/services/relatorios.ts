import "server-only";
import { type Briefing } from "@/domain/briefing";
import { PECAS, type TipoPeca } from "@/domain/catalogo";
import { custoPadrao } from "@/domain/custos";
import { PLANO_PERSONALIZADO } from "@/domain/precos";
import { ErroNegocio, um, varios } from "../db";
import type { Usuario } from "../auth";
import { paraSql } from "../datas";
import { precos } from "./precos";

// Relatórios gerenciais (somente admin): faturamento, créditos, fluxo de jobs e margem.
// Custo = custo padrão por tipo de peça (domain/custos.ts), não horas reais.

export type CodigoPeriodo = "mes" | "mes_passado" | "90d" | "ano" | "tudo";

export const PERIODOS: { id: CodigoPeriodo; rotulo: string }[] = [
  { id: "mes", rotulo: "Este mês" },
  { id: "mes_passado", rotulo: "Mês passado" },
  { id: "90d", rotulo: "Últimos 90 dias" },
  { id: "ano", rotulo: "Este ano" },
  { id: "tudo", rotulo: "Desde o início" },
];

export function intervalo(codigo: CodigoPeriodo, agora = new Date()): { de: string; ate: string } {
  const y = agora.getUTCFullYear();
  const m = agora.getUTCMonth();
  const ate = paraSql(agora);
  switch (codigo) {
    case "mes":
      return { de: paraSql(new Date(Date.UTC(y, m, 1))), ate };
    case "mes_passado":
      return { de: paraSql(new Date(Date.UTC(y, m - 1, 1))), ate: paraSql(new Date(Date.UTC(y, m, 1) - 1000)) };
    case "90d":
      return { de: paraSql(new Date(agora.getTime() - 90 * 86400_000)), ate };
    case "ano":
      return { de: paraSql(new Date(Date.UTC(y, 0, 1))), ate };
    default:
      return { de: "0000-01-01 00:00:00", ate };
  }
}

const EVENTOS_CONCLUSAO = "('cliente_aprovou','concluido_equipe','concluido_gerente','aprovacao_automatica')";

export interface LinhaTipo {
  tipo: TipoPeca;
  nome: string;
  concluidos: number;
  creditos: number;
  receita: number;
  custo: number;
  margem: number;
}

export interface LinhaDesigner {
  nome: string;
  concluidos: number;
  reprovacoesInternas: number;
  ajustesCliente: number;
  custo: number;
}

export function relatorio(admin: Usuario, codigo: CodigoPeriodo) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador vê os relatórios.", 403);
  const { de, ate } = intervalo(codigo);

  // ---------- Faturamento ----------
  const faturas = varios<{ valor_centavos: number; tipo: string | null; criado_em: string }>(
    `SELECT f.valor_centavos, f.criado_em, (SELECT c.tipo FROM creditos c WHERE c.fatura_id = f.id LIMIT 1) tipo
     FROM faturas f WHERE f.status = 'paga' AND f.criado_em BETWEEN ? AND ?`,
    de,
    ate,
  );
  const reais = (centavos: number) => centavos / 100;
  const faturado = reais(faturas.reduce((s, f) => s + f.valor_centavos, 0));
  const mensalidades = reais(faturas.filter((f) => f.tipo === "assinatura").reduce((s, f) => s + f.valor_centavos, 0));
  const avulsos = faturado - mensalidades;

  const assinaturas = varios<{
    plano_id: string;
    status: string;
    renovacao_automatica: number;
    inadimplente_desde: string | null;
    personalizado_preco: number | null;
  }>("SELECT plano_id, status, renovacao_automatica, inadimplente_desde, personalizado_preco FROM assinaturas");
  const ativas = assinaturas.filter((a) => a.status === "ativa");
  // Receita recorrente: só quem vai pagar a próxima mensalidade (renovação ligada e pagamento em dia).
  const recorrentes = ativas.filter((a) => a.renovacao_automatica && !a.inadimplente_desde);
  const tabela = precos();
  const custos = tabela.custos;
  const impostosPct = custos.impostosPct / 100;
  const receitaRecorrente = recorrentes.reduce(
    (s, a) =>
      s +
      (a.plano_id === PLANO_PERSONALIZADO
        ? (a.personalizado_preco ?? 0)
        : (tabela.planos.find((p) => p.id === a.plano_id)?.precoMes ?? 0)),
    0,
  );

  // Faturamento dos últimos 12 meses (gráfico), independente do filtro.
  const porMes = varios<{ mes: string; centavos: number }>(
    `SELECT substr(criado_em, 1, 7) mes, SUM(valor_centavos) centavos FROM faturas
     WHERE status = 'paga' AND criado_em >= date('now', 'start of month', '-11 months')
     GROUP BY mes`,
  );
  const meses: { mes: string; valor: number }[] = [];
  const hoje = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1));
    const chave = d.toISOString().slice(0, 7);
    meses.push({ mes: chave, valor: reais(porMes.find((x) => x.mes === chave)?.centavos ?? 0) });
  }

  // ---------- Créditos ----------
  const somaCreditos = (tipos: string[]) =>
    um<{ s: number }>(
      `SELECT COALESCE(SUM(quantidade), 0) s FROM creditos WHERE tipo IN (${tipos.map(() => "?").join(",")}) AND criado_em BETWEEN ? AND ?`,
      ...tipos,
      de,
      ate,
    )!.s;
  const creditos = {
    vendidos: somaCreditos(["assinatura", "compra"]),
    cortesias: somaCreditos(["ajuste"]),
    consumidos: -somaCreditos(["pedido", "revisao_extra"]),
    devolvidos: somaCreditos(["estorno"]),
    expirados: -somaCreditos(["expiracao"]),
    emAberto: um<{ s: number }>(
      "SELECT COALESCE(SUM(c.quantidade), 0) s FROM creditos c JOIN usuarios u ON u.id = c.usuario_id WHERE u.ativo = 1",
    )!.s,
  };
  // Valor médio do crédito: tudo o que foi pago ÷ créditos vendidos, desde o início (mais estável).
  const historico = um<{ reais: number; vendidos: number }>(
    `SELECT (SELECT COALESCE(SUM(valor_centavos), 0) / 100.0 FROM faturas WHERE status = 'paga') reais,
            (SELECT COALESCE(SUM(quantidade), 0) FROM creditos WHERE tipo IN ('assinatura','compra')) vendidos`,
  )!;
  const valorCredito = historico.vendidos ? historico.reais / historico.vendidos : 0;

  // ---------- Jobs ----------
  const contar = (sql: string, ...p: string[]) => um<{ n: number }>(sql, ...p)!.n;
  const criados = contar("SELECT COUNT(*) n FROM pedidos WHERE criado_em BETWEEN ? AND ?", de, ate);
  const cancelados = contar(
    "SELECT COUNT(*) n FROM eventos WHERE tipo = 'cancelado' AND criado_em BETWEEN ? AND ?",
    de,
    ate,
  );
  const emAndamento = contar("SELECT COUNT(*) n FROM pedidos WHERE status NOT IN ('aprovado','cancelado')");

  const concluidos = varios<{
    tipo: TipoPeca;
    briefing: string;
    creditos: number;
    revisoes_usadas: number;
    tentativas_internas: number;
    entrega_prevista: string;
    concluido_em: string;
    forma: string;
    designer: string | null;
  }>(
    `SELECT p.tipo, p.briefing, p.creditos, p.revisoes_usadas, p.tentativas_internas, p.entrega_prevista,
            e.criado_em concluido_em, e.tipo forma, d.nome designer
     FROM pedidos p
     JOIN eventos e ON e.id = (SELECT MAX(id) FROM eventos WHERE pedido_id = p.id AND tipo IN ${EVENTOS_CONCLUSAO})
     LEFT JOIN usuarios d ON d.id = p.designer_id
     WHERE p.status = 'aprovado' AND e.criado_em BETWEEN ? AND ?`,
    de,
    ate,
  );

  const porTipo = new Map<TipoPeca, LinhaTipo>();
  const porDesigner = new Map<string, LinhaDesigner>();
  let noPrazo = 0;
  let primeira = 0;
  let aprovadosCliente = 0;
  let rodadas = 0;
  let custoTotal = 0;
  for (const p of concluidos) {
    const b = JSON.parse(p.briefing) as Briefing;
    const retrabalho = p.revisoes_usadas + p.tentativas_internas;
    const custo = custoPadrao(b, custos, retrabalho).total;
    const receita = p.creditos * valorCredito;
    custoTotal += custo;
    rodadas += p.revisoes_usadas;
    if (p.concluido_em <= p.entrega_prevista) noPrazo++;
    if (p.forma === "cliente_aprovou") {
      aprovadosCliente++;
      if (retrabalho === 0) primeira++;
    }
    const t = porTipo.get(p.tipo) ?? {
      tipo: p.tipo,
      nome: PECAS.find((x) => x.id === p.tipo)?.nome ?? p.tipo,
      concluidos: 0,
      creditos: 0,
      receita: 0,
      custo: 0,
      margem: 0,
    };
    t.concluidos++;
    t.creditos += p.creditos;
    t.receita += receita;
    t.custo += custo;
    porTipo.set(p.tipo, t);
    const nome = p.designer ?? "Sem designer";
    const dz = porDesigner.get(nome) ?? { nome, concluidos: 0, reprovacoesInternas: 0, ajustesCliente: 0, custo: 0 };
    dz.concluidos++;
    dz.reprovacoesInternas += p.tentativas_internas;
    dz.ajustesCliente += p.revisoes_usadas;
    dz.custo += custo;
    porDesigner.set(nome, dz);
  }
  const tipos = [...porTipo.values()].map((t) => ({ ...t, margem: t.receita * (1 - impostosPct) - t.custo }));

  // ---------- Margem dos jobs concluídos ----------
  const receitaJobs = concluidos.reduce((s, p) => s + p.creditos * valorCredito, 0);
  const impostos = receitaJobs * impostosPct;
  const margem = receitaJobs - impostos - custoTotal;

  return {
    periodo: { de, ate },
    custos,
    faturamento: { faturado, mensalidades, avulsos, receitaRecorrente, assinantes: ativas.length, naoRenovam: ativas.filter((a) => !a.renovacao_automatica).length, inadimplentes: ativas.filter((a) => a.inadimplente_desde).length, cancelados: assinaturas.length - ativas.length, meses },
    creditos: { ...creditos, valorCredito },
    jobs: {
      criados,
      concluidos: concluidos.length,
      cancelados,
      emAndamento,
      noPrazo: concluidos.length ? noPrazo / concluidos.length : null,
      mediaAjustes: concluidos.length ? rodadas / concluidos.length : null,
      aprovacaoPrimeira: aprovadosCliente ? primeira / aprovadosCliente : null,
      porTipo: tipos.sort((a, b) => b.receita - a.receita),
      porDesigner: [...porDesigner.values()].sort((a, b) => b.concluidos - a.concluidos),
    },
    margem: {
      receita: receitaJobs,
      impostos,
      custo: custoTotal,
      margem,
      percentual: receitaJobs ? margem / receitaJobs : null,
      alvo: custos.margemAlvoPct / 100,
      impostosPct,
    },
  };
}

export type Relatorio = ReturnType<typeof relatorio>;
