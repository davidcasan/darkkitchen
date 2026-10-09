import "server-only";
import { PLANO_PERSONALIZADO, type Plano, planoPersonalizado, planoPorId } from "@/domain/precos";
import type { Usuario } from "../auth";
import { ErroNegocio, executar, transacao, um, varios } from "../db";
import { adicionarMeses, agoraSql, deSql, formatarData, paraSql } from "../datas";
import { lancar, saldo } from "./creditos";
import { IMPORTANTE, notificar, notificarPapel } from "./notificacoes";
import { pagaPorPix, tentarCobrar } from "./pagamentos";
import { DIAS_PARA_PAGAR, codigoDaFatura } from "./pix";
import { precos } from "./precos";

// Assinatura mensal (regras de out/2026):
// - Renovação automática ao fim de cada período de um mês. O cliente pode desligar;
//   aí a assinatura termina no fim do período, sem nova cobrança.
// - Créditos expiram no fim de cada período: o saldo que sobrar sai do extrato
//   (tipo "expiracao") e os créditos do novo período entram. Aviso 2 dias antes.
//   Sem assinatura ativa, o saldo expira no fim do mês do calendário.
// - Pagamento pela forma padrão do cliente:
//   · Cartão (simulado): cobra na hora e libera na hora. Recusado na renovação: carência
//     (CARENCIA_DIAS) com nova tentativa por dia e botão "Tentar pagar agora".
//   · Pix: gera uma fatura pendente com QR Code. Nada é liberado até o admin confirmar
//     que o dinheiro caiu (Pagamentos). Na renovação, a cobrança do mês fica disponível
//     por CARENCIA_DIAS; sem confirmação até lá, a assinatura termina.
//   O que liberar na confirmação fica na própria fatura (coluna "acao").
// - Assinatura "pendente": conta nova esperando o 1º pagamento por Pix ou a negociação do
//   plano Personalizado. A área do cliente mostra só a cobrança e o chat.
// - Upgrade: com cartão, imediato; com Pix, os créditos extras entram na confirmação.
//   Downgrade fica agendado para a próxima renovação.
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
  status: "ativa" | "cancelada" | "pendente";
  periodo_inicio: string;
  periodo_fim: string;
  plano_proximo: string | null; // troca para plano menor, aplicada na próxima renovação
  renovacao_automatica: number; // 1 = renova; 0 = termina no fim do período
  inadimplente_desde: string | null; // renovação não paga; em carência desde esta data
  tentativas_cobranca: number;
  proxima_tentativa: string | null; // só cartão: próxima tentativa automática
  aviso_expiracao: string | null;
  personalizado_preco: number | null; // valores do plano Personalizado combinados com o cliente
  personalizado_creditos: number | null;
}

type AssinaturaDe = Assinatura & { usuario_id: number };

const CAMPOS =
  "id, usuario_id, plano_id, status, periodo_inicio, periodo_fim, plano_proximo, renovacao_automatica, inadimplente_desde, tentativas_cobranca, proxima_tentativa, aviso_expiracao, personalizado_preco, personalizado_creditos";

export const assinaturaDo = (usuarioId: number) =>
  um<AssinaturaDe>(`SELECT ${CAMPOS} FROM assinaturas WHERE usuario_id = ?`, usuarioId);

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

/** Fim da carência de uma assinatura com a renovação não paga. */
export const fimDaCarencia = (a: Pick<Assinatura, "inadimplente_desde">) =>
  a.inadimplente_desde ? paraSql(new Date(deSql(a.inadimplente_desde).getTime() + CARENCIA_DIAS * DIA_MS)) : null;

/** Zera o saldo positivo do cliente com um lançamento de expiração. */
function expirarSaldo(usuarioId: number, descricao: string) {
  const s = saldo(usuarioId);
  if (s > 0) lancar(usuarioId, -s, "expiracao", descricao);
  return Math.max(0, s);
}

function encerrar(a: AssinaturaDe, aviso: string) {
  executar(
    `UPDATE assinaturas SET status = 'cancelada', plano_proximo = NULL, renovacao_automatica = 1,
       inadimplente_desde = NULL, tentativas_cobranca = 0, proxima_tentativa = NULL WHERE id = ?`,
    a.id,
  );
  cancelarPixPendentes(a.usuario_id, "renovar");
  notificar(a.usuario_id, aviso, "/cliente/conta", IMPORTANTE);
}

// ---------- Pagamento: cartão na hora, Pix com confirmação do admin ----------

/** O que liberar quando o pagamento for aprovado (cartão) ou confirmado (Pix). */
export type Acao =
  | { tipo: "ativar"; planoId: string; manterSaldo?: boolean } // começa um período novo
  | { tipo: "renovar"; planoId: string } // renovação depois do fim do período
  | { tipo: "upgrade"; planoId: string; creditos: number }; // créditos extras de um plano maior

type Pagamento = { situacao: "pago" } | { situacao: "aguardando_pix"; faturaId: number } | { situacao: "recusado"; mensagem: string };

/** Fatura pendente de Pix, com o código copia e cola e o que liberar na confirmação. */
function criarCobrancaPix(usuarioId: number, valorReais: number, descricao: string, acao: Acao) {
  const faturaId = executar(
    `INSERT INTO faturas (usuario_id, descricao, valor_centavos, status, metodo, vence_em, acao)
     VALUES (?, ?, ?, 'pendente', 'Pix', ?, ?)`,
    usuarioId,
    descricao,
    Math.round(valorReais * 100),
    paraSql(new Date(Date.now() + DIAS_PARA_PAGAR * DIA_MS)),
    JSON.stringify(acao),
  ).id;
  executar("UPDATE faturas SET pix_payload = ? WHERE id = ?", codigoDaFatura(faturaId, valorReais), faturaId);
  notificarPapel(["admin"], `Pix aguardando confirmação: ${descricao} (${valorReais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`, "/equipe/pagamentos");
  return faturaId;
}

function cancelarPixPendentes(usuarioId: number, tipo?: Acao["tipo"]) {
  executar(
    `UPDATE faturas SET status = 'cancelada' WHERE usuario_id = ? AND status = 'pendente' AND acao IS NOT NULL
       ${tipo ? "AND json_extract(acao, '$.tipo') = ?" : ""}`,
    ...(tipo ? [usuarioId, tipo] : [usuarioId]),
  );
}

/** Cobra pela forma padrão do cliente. Cartão: cobra e libera. Pix: deixa a cobrança pendente. */
function pagar(usuarioId: number, valorReais: number, descricao: string, acao: Acao): Pagamento {
  if (pagaPorPix(usuarioId))
    return { situacao: "aguardando_pix", faturaId: criarCobrancaPix(usuarioId, valorReais, descricao, acao) };
  const r = tentarCobrar(usuarioId, valorReais, descricao);
  if (!r.aprovado) return { situacao: "recusado", mensagem: r.mensagem };
  executarAcao(usuarioId, acao, r.faturaId);
  return { situacao: "pago" };
}

/** Libera o que foi pago: créditos e período da assinatura. */
function executarAcao(usuarioId: number, acao: Acao, faturaId?: number) {
  const a = assinaturaDo(usuarioId);
  if (!a) throw new ErroNegocio("Assinatura não encontrada.");
  const plano = planoDaAssinatura(a, acao.planoId);
  if (!plano) throw new ErroNegocio("O plano desta cobrança não existe mais.");

  if (acao.tipo === "upgrade") {
    lancar(usuarioId, acao.creditos, "assinatura", `Upgrade para o plano ${plano.nome}`, { faturaId });
    executar("UPDATE assinaturas SET plano_id = ?, plano_proximo = NULL WHERE id = ?", plano.id, a.id);
    return;
  }

  const agora = new Date();
  let inicio = agora;
  if (acao.tipo === "renovar" && a.status === "ativa" && !a.inadimplente_desde) {
    // Em dia: o novo período emenda no anterior (a não ser que o servidor tenha ficado parado).
    const fimAnterior = deSql(a.periodo_fim);
    if (adicionarMeses(fimAnterior, 1) > agora) inicio = fimAnterior;
  }
  if (acao.tipo === "ativar" && !acao.manterSaldo) expirarSaldo(usuarioId, "Créditos anteriores à nova assinatura");
  lancar(usuarioId, plano.creditosMes, "assinatura", `Créditos do plano ${plano.nome}`, { faturaId });
  executar(
    `UPDATE assinaturas SET plano_id = ?, status = 'ativa', periodo_inicio = ?, periodo_fim = ?, plano_proximo = NULL,
       inadimplente_desde = NULL, tentativas_cobranca = 0, proxima_tentativa = NULL, aviso_expiracao = NULL,
       renovacao_automatica = CASE WHEN status = 'ativa' THEN renovacao_automatica ELSE 1 END
     WHERE id = ?`,
    plano.id,
    paraSql(inicio),
    paraSql(adicionarMeses(inicio, 1)),
    a.id,
  );
}

// ---------- Cobranças Pix: cliente vê, avisa que pagou; admin confirma ou cancela ----------

export interface CobrancaPix {
  id: number;
  usuario_id: number;
  descricao: string;
  valor_centavos: number;
  pix_payload: string;
  vence_em: string | null;
  criado_em: string;
  aviso_pago_em: string | null;
  acao: string;
}

export const cobrancasPixDo = (usuarioId: number) =>
  varios<CobrancaPix>(
    `SELECT id, usuario_id, descricao, valor_centavos, pix_payload, vence_em, criado_em, aviso_pago_em, acao
     FROM faturas WHERE usuario_id = ? AND status = 'pendente' AND pix_payload IS NOT NULL ORDER BY id`,
    usuarioId,
  );

export const cobrancasPixPendentes = () =>
  varios<CobrancaPix & { cliente_nome: string; cliente_email: string; empresa: string | null }>(
    `SELECT f.id, f.usuario_id, f.descricao, f.valor_centavos, f.pix_payload, f.vence_em, f.criado_em, f.aviso_pago_em, f.acao,
            u.nome cliente_nome, u.email cliente_email, u.empresa
     FROM faturas f JOIN usuarios u ON u.id = f.usuario_id
     WHERE f.status = 'pendente' AND f.pix_payload IS NOT NULL
     ORDER BY (f.aviso_pago_em IS NULL), f.id`,
  );

export const contarPixPendentes = () =>
  um<{ n: number }>("SELECT COUNT(*) n FROM faturas WHERE status = 'pendente' AND pix_payload IS NOT NULL")?.n ?? 0;

/** Cliente avisa que já pagou o Pix (o admin recebe um aviso para conferir). */
export function avisarPagamento(usuarioId: number, faturaId: number) {
  const f = um<{ descricao: string; aviso_pago_em: string | null }>(
    "SELECT descricao, aviso_pago_em FROM faturas WHERE id = ? AND usuario_id = ? AND status = 'pendente' AND pix_payload IS NOT NULL",
    faturaId,
    usuarioId,
  );
  if (!f) throw new ErroNegocio("Cobrança não encontrada.", 404);
  if (f.aviso_pago_em) return;
  const nome = um<{ nome: string }>("SELECT nome FROM usuarios WHERE id = ?", usuarioId)?.nome;
  executar("UPDATE faturas SET aviso_pago_em = datetime('now') WHERE id = ?", faturaId);
  notificarPapel(["admin"], `${nome} avisou que pagou o Pix: ${f.descricao}. Confira e confirme.`, "/equipe/pagamentos", IMPORTANTE);
}

/** Admin confirma que o Pix caiu: a fatura vira paga e o que ela libera é aplicado. */
export function confirmarPagamento(admin: Usuario, faturaId: number) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o admin confirma pagamentos.", 403);
  return transacao(() => {
    const f = um<{ usuario_id: number; descricao: string; acao: string | null }>(
      "SELECT usuario_id, descricao, acao FROM faturas WHERE id = ? AND status = 'pendente'",
      faturaId,
    );
    if (!f) throw new ErroNegocio("Esta cobrança não está mais pendente.", 404);
    executar(
      "UPDATE faturas SET status = 'paga', confirmada_em = datetime('now'), confirmada_por = ?, referencia_gateway = 'pix-manual' WHERE id = ?",
      admin.id,
      faturaId,
    );
    if (f.acao) {
      const acao = JSON.parse(f.acao) as Acao;
      executarAcao(f.usuario_id, acao, faturaId);
      // Outra cobrança da mesma renovação (ex.: gerada de novo) não precisa mais ser paga.
      if (acao.tipo !== "upgrade") cancelarPixPendentes(f.usuario_id, acao.tipo);
    }
    notificar(f.usuario_id, `Pagamento confirmado: ${f.descricao}. Os créditos já estão no seu saldo.`, "/cliente/creditos", IMPORTANTE);
  });
}

/** Admin cancela uma cobrança Pix (ex.: gerada por engano). Nada é liberado. */
export function cancelarCobranca(admin: Usuario, faturaId: number) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o admin cancela cobranças.", 403);
  const f = um<{ usuario_id: number; descricao: string }>(
    "SELECT usuario_id, descricao FROM faturas WHERE id = ? AND status = 'pendente'",
    faturaId,
  );
  if (!f) throw new ErroNegocio("Esta cobrança não está mais pendente.", 404);
  executar("UPDATE faturas SET status = 'cancelada' WHERE id = ?", faturaId);
  notificar(f.usuario_id, `A cobrança "${f.descricao}" foi cancelada. Qualquer dúvida, fale com o atendimento.`, "/cliente/conta", IMPORTANTE);
}

// ---------- Renovação ----------

/**
 * Cobra a renovação. Cartão aprovado: novo período com os créditos do plano (ou do plano
 * agendado). Pix: deixa a cobrança do mês pendente. Cartão recusado: entra ou continua em
 * carência; vencida a carência, encerra.
 */
function tentarRenovar(a: AssinaturaDe): { ok: true } | { ok: false; mensagem: string } {
  const plano = planoDaAssinatura(a, a.plano_proximo) ?? planoDaAssinatura(a);
  if (!plano) {
    encerrar(a, "Sua assinatura terminou porque o plano não existe mais. Escolha um novo plano em Conta.");
    return { ok: false, mensagem: "Plano indisponível." };
  }
  const agora = new Date();
  const desde = a.inadimplente_desde ?? paraSql(agora);
  const fimCarencia = formatarData(fimDaCarencia({ inadimplente_desde: desde })!);

  // Pix: uma cobrança por renovação (se já existe, só espera a confirmação).
  if (pagaPorPix(a.usuario_id)) {
    const jaTem = cobrancasPixDo(a.usuario_id).some((c) => (JSON.parse(c.acao) as Acao).tipo === "renovar");
    if (!jaTem) pagar(a.usuario_id, plano.precoMes, `Plano ${plano.nome} · mensalidade`, { tipo: "renovar", planoId: plano.id });
    executar(
      "UPDATE assinaturas SET inadimplente_desde = ?, proxima_tentativa = NULL WHERE id = ?",
      desde,
      a.id,
    );
    if (!a.inadimplente_desde)
      notificar(
        a.usuario_id,
        `A mensalidade do plano ${plano.nome} está disponível para pagamento por Pix. Pague até ${fimCarencia}: os créditos do novo mês entram assim que confirmarmos o pagamento.`,
        "/cliente/conta",
        IMPORTANTE,
      );
    return { ok: false, mensagem: "Aguardando o pagamento do Pix." };
  }

  const r = pagar(a.usuario_id, plano.precoMes, `Plano ${plano.nome} · mensalidade`, { tipo: "renovar", planoId: plano.id });
  if (r.situacao === "pago") {
    cancelarPixPendentes(a.usuario_id, "renovar");
    if (a.inadimplente_desde)
      notificar(a.usuario_id, `Pagamento aprovado. Seu plano ${plano.nome} está em dia e ${plano.creditosMes} créditos entraram no saldo.`, "/cliente/creditos", IMPORTANTE);
    return { ok: true };
  }
  const mensagem = r.situacao === "recusado" ? r.mensagem : "Pagamento pendente.";
  if (agora.getTime() - deSql(desde).getTime() >= CARENCIA_DIAS * DIA_MS) {
    encerrar(a, `Sua assinatura do plano ${plano.nome} terminou porque não conseguimos cobrar a renovação. Você pode assinar de novo em Conta.`);
    return { ok: false, mensagem };
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
      `Não conseguimos cobrar a renovação do plano ${plano.nome} (${mensagem}). Atualize a forma de pagamento até ${fimCarencia} para não perder a assinatura.`,
      "/cliente/conta",
      IMPORTANTE,
    );
  return { ok: false, mensagem };
}

/** Processa uma assinatura ativa: aviso de expiração, fim de período, renovação e carência. */
function processar(a: AssinaturaDe) {
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
          IMPORTANTE,
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
  // Em carência. Cartão: nova tentativa quando chega a hora. Pix: espera a confirmação
  // do admin até o fim da carência.
  if (a.proxima_tentativa) {
    if (a.proxima_tentativa <= agora) tentarRenovar(a);
  } else if (fimDaCarencia(a)! <= agora) {
    const plano = planoDaAssinatura(a, a.plano_proximo) ?? planoDaAssinatura(a);
    encerrar(a, `Sua assinatura do plano ${plano?.nome ?? ""} terminou porque o Pix da renovação não foi pago a tempo. Você pode assinar de novo em Conta.`);
  }
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
  const carenciaDesde = paraSql(new Date(Date.now() - CARENCIA_DIAS * DIA_MS));
  const pendentes = varios<AssinaturaDe>(
    `SELECT ${CAMPOS} FROM assinaturas
     WHERE status = 'ativa' AND (? IS NULL OR usuario_id = ?)
       AND (periodo_fim <= ?
            OR (inadimplente_desde IS NOT NULL AND (proxima_tentativa <= ? OR (proxima_tentativa IS NULL AND inadimplente_desde <= ?)))
            OR (periodo_fim <= ? AND aviso_expiracao IS NOT periodo_fim))`,
    usuarioId ?? null,
    usuarioId ?? null,
    agora,
    agora,
    carenciaDesde,
    avisoAte,
  );
  // Em carência por Pix e ainda no prazo: nada a fazer agora (só espera a confirmação).
  const aProcessar = pendentes.filter((a) => !(a.inadimplente_desde && !a.proxima_tentativa && fimDaCarencia(a)! > agora));
  for (const a of aProcessar) {
    // Cada assinatura em sua transação: um erro numa não trava as outras.
    try {
      transacao(() => processar(a));
    } catch (e) {
      console.error(`[dark-kitchen] Falha ao processar a assinatura ${a.id}:`, e);
    }
  }
  transacao(() => expirarSemAssinatura(usuarioId));
  return aProcessar.length;
}

// ---------- Assinar, renovação, troca de plano ----------

export type ResultadoAssinar = "ativa" | "aguardando_pix";

/**
 * Assinatura de um plano comum: no cadastro ou depois que a anterior terminou.
 * Cartão: cobra e ativa na hora. Pix: a assinatura fica pendente até o admin confirmar.
 */
export function assinar(usuarioId: number, planoId: string): ResultadoAssinar {
  const plano = planoPorId(precos(), planoId);
  if (!plano?.ativo) throw new ErroNegocio("Este plano não está disponível.");
  return transacao(() => {
    const atual = assinaturaDo(usuarioId);
    if (atual?.status === "ativa") throw new ErroNegocio("Você já tem uma assinatura ativa.");
    if (atual) {
      cancelarPixPendentes(usuarioId, "ativar");
      executar(
        `UPDATE assinaturas SET plano_id = ?, status = 'pendente', plano_proximo = NULL, inadimplente_desde = NULL,
           tentativas_cobranca = 0, proxima_tentativa = NULL WHERE id = ?`,
        planoId,
        atual.id,
      );
    } else {
      executar(
        "INSERT INTO assinaturas (usuario_id, plano_id, status, periodo_inicio, periodo_fim) VALUES (?, ?, 'pendente', datetime('now'), datetime('now'))",
        usuarioId,
        planoId,
      );
    }
    const r = pagar(usuarioId, plano.precoMes, `Plano ${plano.nome} · mensalidade`, { tipo: "ativar", planoId });
    if (r.situacao === "recusado") throw new ErroNegocio(r.mensagem, 402);
    return r.situacao === "pago" ? "ativa" : "aguardando_pix";
  });
}

/**
 * Cadastro com o plano Personalizado: a conta fica pendente, sem cobrança, enquanto o
 * cliente combina créditos e valor com o atendimento pelo chat.
 */
export function iniciarNegociacaoPersonalizado(usuarioId: number, nome: string) {
  executar(
    "INSERT INTO assinaturas (usuario_id, plano_id, status, periodo_inicio, periodo_fim) VALUES (?, ?, 'pendente', datetime('now'), datetime('now'))",
    usuarioId,
    PLANO_PERSONALIZADO,
  );
  notificarPapel(
    ["admin"],
    `${nome} criou uma conta e quer o plano Personalizado. Combine pelo chat e defina os valores na conta do cliente.`,
    `/equipe/atendimento?cliente=${usuarioId}`,
    IMPORTANTE,
  );
}

/** Conta pendente com plano comum e sem cobrança aberta: gera o Pix de novo. */
export function gerarPixDeNovo(usuarioId: number) {
  return transacao(() => {
    const a = assinaturaDo(usuarioId);
    if (a?.status !== "pendente") throw new ErroNegocio("Não há assinatura aguardando pagamento.");
    if (cobrancasPixDo(usuarioId).length) throw new ErroNegocio("Já existe um Pix aguardando pagamento.");
    const plano = planoDaAssinatura(a);
    if (!plano) throw new ErroNegocio("O valor do seu plano ainda está sendo combinado com o atendimento.");
    criarCobrancaPix(usuarioId, plano.precoMes, `Plano ${plano.nome} · mensalidade`, { tipo: "ativar", planoId: plano.id });
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

/** "Tentar pagar agora" na carência: cobra no cartão padrão (ou gera o Pix, se ainda não houver). */
export function pagarRenovacaoAgora(usuarioId: number) {
  const r = transacao(() => {
    const a = assinaturaDo(usuarioId);
    if (a?.status !== "ativa" || !a.inadimplente_desde) throw new ErroNegocio("Não há cobrança pendente.");
    if (pagaPorPix(usuarioId) && cobrancasPixDo(usuarioId).length)
      throw new ErroNegocio("Pague o Pix que está na sua Conta. Assim que confirmarmos, os créditos entram.");
    return tentarRenovar(a);
  });
  // A fatura recusada fica registrada; o erro só sai depois de gravar.
  if (!r.ok && !pagaPorPix(usuarioId)) throw new ErroNegocio(`${r.mensagem} Tente outra forma de pagamento.`, 402);
}

export type ResultadoTroca =
  | { tipo: "upgrade"; plano: string; cobrado: number; creditos: number }
  | { tipo: "upgrade_pix"; plano: string; valor: number; creditos: number }
  | { tipo: "agendada"; plano: string; em: string }
  | { tipo: "cancelou_agendamento"; plano: string }
  | { tipo: "assinou"; plano: string }
  | { tipo: "assinou_pix"; plano: string };

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
 * - Para um plano com MAIS créditos (upgrade): cobra a diferença de preço e credita a
 *   diferença de créditos (cartão: na hora; Pix: na confirmação). A renovação segue na mesma
 *   data com o novo plano. Sem proporcional por dias; os créditos extras expiram junto.
 * - Para um plano com MENOS créditos: agendada para a próxima renovação, sem reembolso.
 * - Sem assinatura ativa: assina o plano escolhido.
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
    const r = assinar(usuarioId, planoId);
    return { tipo: r === "ativa" ? "assinou" : "assinou_pix", plano: novo.nome };
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
    if (cobrancasPixDo(usuarioId).some((c) => (JSON.parse(c.acao) as Acao).tipo === "upgrade"))
      throw new ErroNegocio("Já existe um Pix de upgrade aguardando pagamento. Pague ou fale com o atendimento.");
    const acao: Acao = { tipo: "upgrade", planoId: novo.id, creditos: simulacao.creditos };
    const descricao = `Upgrade para o plano ${novo.nome} (diferença do período)`;
    const r = transacao((): Pagamento => {
      if (simulacao.cobrar > 0) return pagar(usuarioId, simulacao.cobrar, descricao, acao);
      executarAcao(usuarioId, acao); // diferença zero: nada a cobrar
      return { situacao: "pago" };
    });
    if (r.situacao === "recusado") throw new ErroNegocio(r.mensagem, 402);
    if (r.situacao === "aguardando_pix")
      return { tipo: "upgrade_pix", plano: novo.nome, valor: simulacao.cobrar, creditos: simulacao.creditos };
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
 * - Sem assinatura ativa (inclusive a conta pendente de quem se cadastrou pelo
 *   Personalizado): gera a cobrança do 1º mês. Cartão: ativa na hora. Pix: o cliente vê o
 *   QR Code e os créditos entram quando o admin confirmar.
 * - "agora": cobra o valor do mês já; os créditos entram (cartão: na hora; Pix: na
 *   confirmação), o período recomeça e o saldo que o cliente tinha continua valendo.
 * - "renovacao": vale a partir da próxima renovação (se já estiver no Personalizado,
 *   só atualiza os valores, que passam a valer na próxima cobrança).
 */
export function aplicarPersonalizado(
  admin: Usuario,
  clienteId: number,
  dados: { precoMes: number; creditosMes: number; quando: "agora" | "renovacao" },
): "renovacao" | "agora" | "aguardando_pix" {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o admin define o plano Personalizado.", 403);
  const { precoMes, creditosMes, quando } = dados;
  if (!(precoMes > 0) || precoMes > 1_000_000) throw new ErroNegocio("Informe o valor por mês, em reais.");
  if (!Number.isInteger(creditosMes) || creditosMes < 1 || creditosMes > 100_000)
    throw new ErroNegocio("Informe os créditos por mês (número inteiro).");
  const cliente = um<{ id: number }>("SELECT id FROM usuarios WHERE id = ? AND papel = 'cliente' AND ativo = 1", clienteId);
  if (!cliente) throw new ErroNegocio("Cliente não encontrado.", 404);
  const plano = planoPersonalizado(precoMes, creditosMes);
  const valores = `${plano.creditosMes} créditos por ${plano.precoMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês`;

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
      notificar(clienteId, `Seu plano Personalizado (${valores}) começa na renovação de ${formatarData(a.periodo_fim)}.`, "/cliente/conta", IMPORTANTE);
      return "renovacao";
    }

    // Agora, ou assinatura nova: guarda os valores e cobra o 1º mês.
    if (a) {
      executar(
        `UPDATE assinaturas SET personalizado_preco = ?, personalizado_creditos = ?
           ${ativa ? "" : ", plano_id = ?, status = 'pendente', plano_proximo = NULL, inadimplente_desde = NULL, proxima_tentativa = NULL"}
         WHERE id = ?`,
        ...(ativa ? [precoMes, creditosMes, a.id] : [precoMes, creditosMes, PLANO_PERSONALIZADO, a.id]),
      );
    } else {
      executar(
        `INSERT INTO assinaturas (usuario_id, plano_id, status, periodo_inicio, periodo_fim, personalizado_preco, personalizado_creditos)
         VALUES (?, ?, 'pendente', datetime('now'), datetime('now'), ?, ?)`,
        clienteId,
        PLANO_PERSONALIZADO,
        precoMes,
        creditosMes,
      );
    }
    cancelarPixPendentes(clienteId, "ativar");
    const r = pagar(clienteId, precoMes, "Plano Personalizado · mensalidade", {
      tipo: "ativar",
      planoId: PLANO_PERSONALIZADO,
      manterSaldo: ativa,
    });
    if (r.situacao === "recusado") throw new ErroNegocio(`Cobrança recusada no cartão do cliente: ${r.mensagem}`, 402);
    if (r.situacao === "aguardando_pix") {
      notificar(
        clienteId,
        `Seu plano Personalizado foi liberado: ${valores}. Pague o Pix na sua área; os créditos entram assim que confirmarmos o pagamento.`,
        "/cliente",
        IMPORTANTE,
      );
      return "aguardando_pix";
    }
    notificar(clienteId, `Seu plano agora é o Personalizado: ${valores}. Os créditos já entraram no saldo.`, "/cliente/creditos", IMPORTANTE);
    return "agora";
  });
}
