import "server-only";
import { PLANO_PERSONALIZADO, type Plano, planoPersonalizado, planoPorId } from "@/domain/precos";
import type { Usuario } from "../auth";
import { ErroNegocio, executar, transacao, um, varios } from "../db";
import { adicionarMeses, agoraSql, deSql, formatarData, paraSql } from "../datas";
import { lancar, saldo } from "./creditos";
import { notificar } from "./notificacoes";
import { cobrar, tentarCobrar } from "./pagamentos";
import { precos } from "./precos";

// Assinatura mensal (regras de out/2026):
// - Renovação automática ao fim de cada período de um mês. O cliente pode desligar;
//   aí a assinatura termina no fim do período, sem nova cobrança.
// - Créditos expiram no fim de cada período: o saldo que sobrar sai do extrato
//   (tipo "expiracao") e os créditos do novo período entram. Aviso 2 dias antes.
//   Sem assinatura ativa, o saldo expira no fim do mês do calendário.
// - Cobrança da renovação recusada: o cliente entra em carência (CARENCIA_DIAS), sem
//   novos créditos, com nova tentativa por dia e botão "Tentar pagar agora". Passada a
//   carência sem pagamento, a assinatura termina.
// - Upgrade é imediato (paga a diferença, recebe a diferença de créditos); downgrade
//   fica agendado para a próxima renovação.
// - Plano Personalizado: sem valor fixo; o admin combina créditos e valor por mês com
//   o cliente e aplica na conta dele (agora ou na próxima renovação).
// Tudo isso roda em processarAssinaturas (a cada hora, em instrumentation.ts) e,
// para o próprio cliente, ao abrir a área logada.

export const CARENCIA_DIAS = 3;
const AVISO_EXPIRACAO_DIAS = 2;
const DIA_MS = 24 * 60 * 60 * 1000;

export interface Assinatura {
  id: number;
  plano_id: string;
  status: "ativa" | "cancelada";
  periodo_inicio: string;
  periodo_fim: string;
  plano_proximo: string | null; // troca para plano menor, aplicada na próxima renovação
  renovacao_automatica: number; // 1 = renova; 0 = termina no fim do período
  inadimplente_desde: string | null; // renovação recusada; em carência desde esta data
  tentativas_cobranca: number;
  proxima_tentativa: string | null;
  aviso_expiracao: string | null;
  personalizado_preco: number | null; // valores do plano Personalizado combinados com o cliente
  personalizado_creditos: number | null;
}

const CAMPOS =
  "id, usuario_id, plano_id, status, periodo_inicio, periodo_fim, plano_proximo, renovacao_automatica, inadimplente_desde, tentativas_cobranca, proxima_tentativa, aviso_expiracao, personalizado_preco, personalizado_creditos";

export const assinaturaDo = (usuarioId: number) =>
  um<Assinatura & { usuario_id: number }>(`SELECT ${CAMPOS} FROM assinaturas WHERE usuario_id = ?`, usuarioId);

/**
 * Plano de uma assinatura: o da tabela ou, para o Personalizado, o montado com os
 * valores combinados. Por padrão, o plano atual; com "id", outro (ex.: o agendado).
 */
export function planoDaAssinatura(
  a: Pick<Assinatura, "plano_id" | "personalizado_preco" | "personalizado_creditos"> | null | undefined,
  id: string | null | undefined = a?.plano_id,
): Plano | undefined {
  if (!a || !id) return undefined;
  if (id === PLANO_PERSONALIZADO)
    return a.personalizado_preco != null && a.personalizado_creditos != null
      ? planoPersonalizado(a.personalizado_preco, a.personalizado_creditos)
      : undefined;
  return planoPorId(precos(), id);
}

/** Fim da carência de uma assinatura com cobrança recusada. */
export const fimDaCarencia = (a: Pick<Assinatura, "inadimplente_desde">) =>
  a.inadimplente_desde ? paraSql(new Date(deSql(a.inadimplente_desde).getTime() + CARENCIA_DIAS * DIA_MS)) : null;

/** Zera o saldo positivo do cliente com um lançamento de expiração. */
function expirarSaldo(usuarioId: number, descricao: string) {
  const s = saldo(usuarioId);
  if (s > 0) lancar(usuarioId, -s, "expiracao", descricao);
  return Math.max(0, s);
}

function encerrar(a: Assinatura & { usuario_id: number }, aviso: string) {
  executar(
    `UPDATE assinaturas SET status = 'cancelada', plano_proximo = NULL, renovacao_automatica = 1,
       inadimplente_desde = NULL, tentativas_cobranca = 0, proxima_tentativa = NULL WHERE id = ?`,
    a.id,
  );
  notificar(a.usuario_id, aviso, "/cliente/conta");
}

/**
 * Cobra a renovação. Aprovada: novo período com os créditos do plano (ou do plano
 * agendado). Recusada: entra ou continua em carência; vencida a carência, encerra.
 */
function tentarRenovar(a: Assinatura & { usuario_id: number }): { ok: true } | { ok: false; mensagem: string } {
  const plano = planoDaAssinatura(a, a.plano_proximo) ?? planoDaAssinatura(a);
  if (!plano) {
    encerrar(a, "Sua assinatura terminou porque o plano não existe mais. Escolha um novo plano em Conta.");
    return { ok: false, mensagem: "Plano indisponível." };
  }
  const agora = new Date();
  const r = tentarCobrar(a.usuario_id, plano.precoMes, `Plano ${plano.nome} · mensalidade`);
  if (r.aprovado) {
    lancar(a.usuario_id, plano.creditosMes, "assinatura", `Créditos do plano ${plano.nome}`, { faturaId: r.faturaId });
    // Em dia: o novo período emenda no anterior. Pago na carência (ou com o servidor
    // parado por mais de um período): o novo período começa no pagamento.
    const fimAnterior = deSql(a.periodo_fim);
    const inicio = a.inadimplente_desde || adicionarMeses(fimAnterior, 1) <= agora ? agora : fimAnterior;
    executar(
      `UPDATE assinaturas SET plano_id = ?, plano_proximo = NULL, periodo_inicio = ?, periodo_fim = ?,
         inadimplente_desde = NULL, tentativas_cobranca = 0, proxima_tentativa = NULL WHERE id = ?`,
      plano.id,
      paraSql(inicio),
      paraSql(adicionarMeses(inicio, 1)),
      a.id,
    );
    if (a.inadimplente_desde)
      notificar(a.usuario_id, `Pagamento aprovado. Seu plano ${plano.nome} está em dia e ${plano.creditosMes} créditos entraram no saldo.`, "/cliente/creditos");
    return { ok: true };
  }

  const desde = a.inadimplente_desde ?? paraSql(agora);
  if (agora.getTime() - deSql(desde).getTime() >= CARENCIA_DIAS * DIA_MS) {
    encerrar(a, `Sua assinatura do plano ${plano.nome} terminou porque não conseguimos cobrar a renovação. Você pode assinar de novo em Conta.`);
    return { ok: false, mensagem: r.mensagem };
  }
  executar(
    "UPDATE assinaturas SET inadimplente_desde = ?, tentativas_cobranca = tentativas_cobranca + 1, proxima_tentativa = ? WHERE id = ?",
    desde,
    paraSql(new Date(agora.getTime() + DIA_MS)),
    a.id,
  );
  if (!a.inadimplente_desde)
    notificar(
      a.usuario_id,
      `Não conseguimos cobrar a renovação do plano ${plano.nome} (${r.mensagem}). Atualize a forma de pagamento até ${formatarData(fimDaCarencia({ inadimplente_desde: desde })!)} para não perder a assinatura.`,
      "/cliente/conta",
    );
  return { ok: false, mensagem: r.mensagem };
}

/** Processa uma assinatura ativa: aviso de expiração, fim de período, renovação e carência. */
function processar(a: Assinatura & { usuario_id: number }) {
  const agora = agoraSql();
  if (!a.inadimplente_desde && a.periodo_fim > agora) {
    // Ainda no período: avisa uma vez quando faltam até 2 dias para os créditos expirarem.
    const faltaMs = deSql(a.periodo_fim).getTime() - Date.now();
    if (a.aviso_expiracao !== a.periodo_fim && faltaMs <= AVISO_EXPIRACAO_DIAS * DIA_MS) {
      const s = saldo(a.usuario_id);
      if (s > 0)
        notificar(
          a.usuario_id,
          a.renovacao_automatica
            ? `Você tem ${s} créditos que expiram em ${formatarData(a.periodo_fim)}, quando seu plano renova. Aproveite para fazer um pedido.`
            : `Sua assinatura termina em ${formatarData(a.periodo_fim)} e ${s} créditos não usados expiram nessa data.`,
          "/cliente/pedidos/novo",
        );
      executar("UPDATE assinaturas SET aviso_expiracao = ? WHERE id = ?", a.periodo_fim, a.id);
    }
    return;
  }
  if (!a.inadimplente_desde) {
    // O período acabou: o saldo não usado expira.
    expirarSaldo(a.usuario_id, `Créditos não usados no período até ${formatarData(a.periodo_fim)}`);
    if (!a.renovacao_automatica) {
      encerrar(a, `Sua assinatura terminou em ${formatarData(a.periodo_fim)}, como você pediu. Para voltar, escolha um plano em Conta.`);
      return;
    }
    tentarRenovar(a);
    return;
  }
  // Em carência: nova tentativa quando chega a hora.
  if (a.proxima_tentativa && a.proxima_tentativa <= agora) tentarRenovar(a);
}

const EXPIRACAO_FIM_DO_MES = "Créditos expirados no fim do mês (sem assinatura ativa)";

/** Créditos de quem está sem assinatura ativa expiram no fim do mês do calendário (Brasília, UTC−3). */
function expirarSemAssinatura(usuarioId?: number) {
  const brasilia = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const inicioMes = paraSql(new Date(Date.UTC(brasilia.getUTCFullYear(), brasilia.getUTCMonth(), 1, 3)));
  // "anterior": saldo no início do mês, descontadas as expirações de fim de mês já feitas
  // neste mês (assim nunca expira duas vezes). O que entrou neste mês vale até o fim dele.
  const linhas = varios<{ id: number; saldo: number; anterior: number }>(
    `SELECT u.id, SUM(c.quantidade) saldo,
            SUM(CASE WHEN c.criado_em < ? OR (c.tipo = 'expiracao' AND c.descricao = ?) THEN c.quantidade ELSE 0 END) anterior
     FROM usuarios u
     JOIN creditos c ON c.usuario_id = u.id
     WHERE u.papel = 'cliente' AND (? IS NULL OR u.id = ?)
       AND NOT EXISTS (SELECT 1 FROM assinaturas a WHERE a.usuario_id = u.id AND a.status = 'ativa')
     GROUP BY u.id HAVING saldo > 0`,
    inicioMes,
    EXPIRACAO_FIM_DO_MES,
    usuarioId ?? null,
    usuarioId ?? null,
  );
  for (const l of linhas) {
    const n = Math.min(l.saldo, l.anterior);
    if (n > 0) lancar(l.id, -n, "expiracao", EXPIRACAO_FIM_DO_MES);
  }
}

/** Roda todas as regras de assinatura. Chamado a cada hora e ao abrir a área do cliente. */
export function processarAssinaturas(usuarioId?: number) {
  const agora = agoraSql();
  const avisoAte = paraSql(new Date(Date.now() + AVISO_EXPIRACAO_DIAS * DIA_MS));
  const pendentes = varios<Assinatura & { usuario_id: number }>(
    `SELECT ${CAMPOS} FROM assinaturas
     WHERE status = 'ativa' AND (? IS NULL OR usuario_id = ?)
       AND (periodo_fim <= ? OR (inadimplente_desde IS NOT NULL AND proxima_tentativa <= ?)
            OR (periodo_fim <= ? AND aviso_expiracao IS NOT periodo_fim))`,
    usuarioId ?? null,
    usuarioId ?? null,
    agora,
    agora,
    avisoAte,
  );
  for (const a of pendentes) {
    // Cada assinatura em sua transação: um erro numa não trava as outras.
    try {
      transacao(() => processar(a));
    } catch (e) {
      console.error(`[dark-kitchen] Falha ao processar a assinatura ${a.id}:`, e);
    }
  }
  transacao(() => expirarSemAssinatura(usuarioId));
  return pendentes.length;
}

/** Primeira assinatura (no cadastro) ou nova assinatura depois que a anterior terminou. */
export function assinar(usuarioId: number, planoId: string) {
  const plano = planoPorId(precos(), planoId);
  if (!plano?.ativo) throw new ErroNegocio("Este plano não está disponível.");
  return transacao(() => {
    const atual = assinaturaDo(usuarioId);
    if (atual?.status === "ativa") throw new ErroNegocio("Você já tem uma assinatura ativa.");
    // Saldo antigo (de quem estava sem assinatura) não passa para o novo período.
    expirarSaldo(usuarioId, "Créditos anteriores à nova assinatura");
    const faturaId = cobrar(usuarioId, plano.precoMes, `Plano ${plano.nome} · mensalidade`);
    lancar(usuarioId, plano.creditosMes, "assinatura", `Créditos do plano ${plano.nome}`, { faturaId });
    const inicio = new Date();
    const periodo = [paraSql(inicio), paraSql(adicionarMeses(inicio, 1))];
    if (atual) {
      executar(
        `UPDATE assinaturas SET plano_id = ?, status = 'ativa', periodo_inicio = ?, periodo_fim = ?, plano_proximo = NULL,
           renovacao_automatica = 1, inadimplente_desde = NULL, tentativas_cobranca = 0, proxima_tentativa = NULL,
           aviso_expiracao = NULL WHERE id = ?`,
        planoId,
        ...periodo,
        atual.id,
      );
    } else {
      executar(
        "INSERT INTO assinaturas (usuario_id, plano_id, status, periodo_inicio, periodo_fim) VALUES (?, ?, 'ativa', ?, ?)",
        usuarioId,
        planoId,
        ...periodo,
      );
    }
  });
}

/**
 * Liga ou desliga a renovação automática.
 * Desligar: a assinatura vale até o fim do período e termina sem nova cobrança; troca
 * agendada é descartada. Em carência, desligar encerra a assinatura na hora.
 * Ligar de novo antes do fim do período não cobra nada.
 */
export function definirRenovacao(usuarioId: number, ligada: boolean) {
  transacao(() => {
    const a = assinaturaDo(usuarioId);
    if (a?.status !== "ativa") throw new ErroNegocio("Você não tem assinatura ativa. Escolha um plano para assinar.");
    if (ligada) {
      executar("UPDATE assinaturas SET renovacao_automatica = 1 WHERE id = ?", a.id);
    } else if (a.inadimplente_desde) {
      encerrar(a, "Assinatura encerrada a seu pedido. Para voltar, escolha um plano em Conta.");
    } else {
      executar("UPDATE assinaturas SET renovacao_automatica = 0, plano_proximo = NULL WHERE id = ?", a.id);
    }
  });
}

/** Nova tentativa de cobrança, pedida pelo cliente durante a carência. */
export function pagarRenovacaoAgora(usuarioId: number) {
  const r = transacao(() => {
    const a = assinaturaDo(usuarioId);
    if (a?.status !== "ativa" || !a.inadimplente_desde) throw new ErroNegocio("Não há cobrança pendente.");
    return tentarRenovar(a);
  });
  // A fatura recusada fica registrada; o erro só sai depois de gravar.
  if (!r.ok) throw new ErroNegocio(`${r.mensagem} Tente outra forma de pagamento.`, 402);
}

export type ResultadoTroca =
  | { tipo: "upgrade"; plano: string; cobrado: number; creditos: number }
  | { tipo: "agendada"; plano: string; em: string }
  | { tipo: "cancelou_agendamento"; plano: string }
  | { tipo: "assinou"; plano: string };

/** Como a troca para um plano funcionaria (para a tela mostrar antes de confirmar). */
export function simularTroca(atual: Plano | undefined, novoId: string) {
  const novo = planoPorId(precos(), novoId);
  if (!atual || !novo || atual.id === novo.id) return null;
  return novo.creditosMes > atual.creditosMes
    ? { tipo: "upgrade" as const, cobrar: Math.max(0, novo.precoMes - atual.precoMes), creditos: novo.creditosMes - atual.creditosMes }
    : { tipo: "agendada" as const };
}

/**
 * Troca de plano.
 * - Para um plano com MAIS créditos (upgrade): imediata. Cobra a diferença de preço,
 *   credita a diferença de créditos agora, e a renovação segue na mesma data com o novo plano.
 *   Sem proporcional por dias; os créditos extras expiram junto com os do período.
 * - Para um plano com MENOS créditos: agendada para a próxima renovação, sem reembolso.
 * - Sem assinatura ativa: assina o plano escolhido (cobra e começa um período novo).
 */
export function trocarPlano(usuarioId: number, planoId: string): ResultadoTroca {
  const atual = assinaturaDo(usuarioId);
  // O Personalizado não se escolhe sozinho; escolher de novo o atual só desfaz troca agendada.
  if (planoId === PLANO_PERSONALIZADO && atual?.status === "ativa" && atual.plano_id === PLANO_PERSONALIZADO) {
    if (!atual.plano_proximo) throw new ErroNegocio("Você já está no plano Personalizado.");
    executar("UPDATE assinaturas SET plano_proximo = NULL WHERE id = ?", atual.id);
    return { tipo: "cancelou_agendamento", plano: "Personalizado" };
  }
  const novo = planoPorId(precos(), planoId);
  if (!novo?.ativo)
    throw new ErroNegocio(
      planoId === PLANO_PERSONALIZADO
        ? "O plano Personalizado é combinado com o atendimento. Fale com a gente pelo chat."
        : "Este plano não está disponível.",
    );
  if (!atual || atual.status !== "ativa") {
    assinar(usuarioId, planoId);
    return { tipo: "assinou", plano: novo.nome };
  }
  if (atual.inadimplente_desde)
    throw new ErroNegocio("A renovação do seu plano está com pagamento pendente. Regularize o pagamento antes de trocar de plano.");
  if (novo.id === atual.plano_id) {
    if (!atual.plano_proximo) throw new ErroNegocio(`Você já está no plano ${novo.nome}.`);
    executar("UPDATE assinaturas SET plano_proximo = NULL WHERE id = ?", atual.id);
    return { tipo: "cancelou_agendamento", plano: novo.nome };
  }

  const simulacao = simularTroca(planoDaAssinatura(atual), novo.id);
  if (simulacao?.tipo === "upgrade") {
    const r = transacao(() => {
      let faturaId: number | undefined;
      if (simulacao.cobrar > 0) {
        const c = tentarCobrar(usuarioId, simulacao.cobrar, `Upgrade para o plano ${novo.nome} (diferença do período)`);
        if (!c.aprovado) return c;
        faturaId = c.faturaId;
      }
      lancar(usuarioId, simulacao.creditos, "assinatura", `Upgrade para o plano ${novo.nome}`, { faturaId });
      executar("UPDATE assinaturas SET plano_id = ?, plano_proximo = NULL WHERE id = ?", novo.id, atual.id);
      return null;
    });
    // A fatura recusada fica registrada; o erro só sai depois de gravar.
    if (r) throw new ErroNegocio(r.mensagem, 402);
    return { tipo: "upgrade", plano: novo.nome, cobrado: simulacao.cobrar, creditos: simulacao.creditos };
  }

  if (!atual.renovacao_automatica)
    throw new ErroNegocio("Sua assinatura termina no fim do período. Ligue a renovação automática para agendar a troca para um plano menor.");
  executar("UPDATE assinaturas SET plano_proximo = ? WHERE id = ?", novo.id, atual.id);
  return { tipo: "agendada", plano: novo.nome, em: atual.periodo_fim };
}

/**
 * Admin aplica o plano Personalizado na conta de um cliente, com os créditos e o valor
 * combinados.
 * - Sem assinatura ativa: assina na hora (cobra e lança os créditos; período começa hoje).
 * - "agora": cobra o valor e lança os créditos já; o período recomeça hoje e o saldo
 *   que o cliente tinha continua valendo até o novo fim.
 * - "renovacao": vale a partir da próxima renovação (se já estiver no Personalizado,
 *   só atualiza os valores, que passam a valer na próxima cobrança).
 */
export function aplicarPersonalizado(
  admin: Usuario,
  clienteId: number,
  dados: { precoMes: number; creditosMes: number; quando: "agora" | "renovacao" },
) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o admin define o plano Personalizado.", 403);
  const { precoMes, creditosMes, quando } = dados;
  if (!(precoMes > 0) || precoMes > 1_000_000) throw new ErroNegocio("Informe o valor por mês, em reais.");
  if (!Number.isInteger(creditosMes) || creditosMes < 1 || creditosMes > 100_000)
    throw new ErroNegocio("Informe os créditos por mês (número inteiro).");
  const cliente = um<{ id: number }>("SELECT id FROM usuarios WHERE id = ? AND papel = 'cliente' AND ativo = 1", clienteId);
  if (!cliente) throw new ErroNegocio("Cliente não encontrado.", 404);
  const plano = planoPersonalizado(precoMes, creditosMes);
  const valores = `${plano.creditosMes} créditos por R$ ${plano.precoMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês`;

  return transacao(() => {
    const a = assinaturaDo(clienteId);
    const ativa = a?.status === "ativa";
    if (ativa && a.inadimplente_desde)
      throw new ErroNegocio("A renovação deste cliente está com pagamento pendente. Regularize antes de mudar o plano.");

    if (ativa && quando === "renovacao") {
      executar(
        "UPDATE assinaturas SET personalizado_preco = ?, personalizado_creditos = ?, plano_proximo = ? WHERE id = ?",
        precoMes,
        creditosMes,
        a.plano_id === PLANO_PERSONALIZADO ? null : PLANO_PERSONALIZADO,
        a.id,
      );
      notificar(
        clienteId,
        `Seu plano Personalizado (${valores}) começa na renovação de ${formatarData(a.periodo_fim)}.`,
        "/cliente/conta",
      );
      return "renovacao" as const;
    }

    // Agora (ou assinatura nova): cobra, lança os créditos e começa um período.
    if (!ativa) expirarSaldo(clienteId, "Créditos anteriores à nova assinatura");
    const faturaId = cobrar(clienteId, precoMes, "Plano Personalizado · mensalidade");
    lancar(clienteId, creditosMes, "assinatura", "Créditos do plano Personalizado", { faturaId });
    const inicio = new Date();
    const periodo = [paraSql(inicio), paraSql(adicionarMeses(inicio, 1))];
    if (a) {
      executar(
        `UPDATE assinaturas SET plano_id = ?, status = 'ativa', periodo_inicio = ?, periodo_fim = ?, plano_proximo = NULL,
           personalizado_preco = ?, personalizado_creditos = ?, inadimplente_desde = NULL, tentativas_cobranca = 0,
           proxima_tentativa = NULL, aviso_expiracao = NULL${ativa ? "" : ", renovacao_automatica = 1"} WHERE id = ?`,
        PLANO_PERSONALIZADO,
        ...periodo,
        precoMes,
        creditosMes,
        a.id,
      );
    } else {
      executar(
        `INSERT INTO assinaturas (usuario_id, plano_id, status, periodo_inicio, periodo_fim, personalizado_preco, personalizado_creditos)
         VALUES (?, ?, 'ativa', ?, ?, ?, ?)`,
        clienteId,
        PLANO_PERSONALIZADO,
        ...periodo,
        precoMes,
        creditosMes,
      );
    }
    notificar(clienteId, `Seu plano agora é o Personalizado: ${valores}. Os créditos já entraram no saldo.`, "/cliente/creditos");
    return "agora" as const;
  });
}
