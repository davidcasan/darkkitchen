import "server-only";
import { planoPorId } from "@/domain/precos";
import { ErroNegocio, executar, transacao, um } from "../db";
import { adicionarMeses, agoraSql, deSql, paraSql } from "../datas";
import { lancar } from "./creditos";
import { cobrar } from "./pagamentos";
import { precos } from "./precos";

// Assinatura mensal. A cada período pago, os créditos do plano entram no extrato.
// Upgrade é imediato (paga a diferença, recebe a diferença de créditos); downgrade
// fica agendado para a próxima renovação.
// Sem servidor de tarefas agendadas por enquanto: a renovação é verificada
// quando o cliente acessa a área (renovarSeVencida). Créditos acumulam até a
// regra definitiva de expiração ser decidida.

export interface Assinatura {
  id: number;
  plano_id: string;
  status: "ativa" | "cancelada";
  periodo_inicio: string;
  periodo_fim: string;
  plano_proximo: string | null; // troca para plano menor, aplicada na próxima renovação
}

export const assinaturaDo = (usuarioId: number) =>
  um<Assinatura>(
    "SELECT id, plano_id, status, periodo_inicio, periodo_fim, plano_proximo FROM assinaturas WHERE usuario_id = ?",
    usuarioId,
  );

function cobrarPeriodo(usuarioId: number, planoId: string, inicio: Date) {
  const plano = planoPorId(precos(), planoId);
  if (!plano) throw new ErroNegocio("Plano inválido.");
  const fim = adicionarMeses(inicio, 1);
  const faturaId = cobrar(usuarioId, plano.precoMes, `Plano ${plano.nome} · mensalidade`);
  lancar(usuarioId, plano.creditosMes, "assinatura", `Créditos do plano ${plano.nome}`, { faturaId });
  return { inicio: paraSql(inicio), fim: paraSql(fim) };
}

/** Primeira assinatura (no cadastro) ou reativação após cancelamento. */
export function assinar(usuarioId: number, planoId: string) {
  if (!planoPorId(precos(), planoId)?.ativo) throw new ErroNegocio("Este plano não está disponível.");
  return transacao(() => {
    const atual = assinaturaDo(usuarioId);
    if (atual?.status === "ativa") throw new ErroNegocio("Você já tem uma assinatura ativa.");
    const p = cobrarPeriodo(usuarioId, planoId, new Date());
    if (atual) {
      executar(
        "UPDATE assinaturas SET plano_id = ?, status = 'ativa', periodo_inicio = ?, periodo_fim = ? WHERE id = ?",
        planoId,
        p.inicio,
        p.fim,
        atual.id,
      );
    } else {
      executar(
        "INSERT INTO assinaturas (usuario_id, plano_id, status, periodo_inicio, periodo_fim) VALUES (?, ?, 'ativa', ?, ?)",
        usuarioId,
        planoId,
        p.inicio,
        p.fim,
      );
    }
  });
}

export type ResultadoTroca =
  | { tipo: "upgrade"; plano: string; cobrado: number; creditos: number }
  | { tipo: "agendada"; plano: string; em: string }
  | { tipo: "cancelou_agendamento"; plano: string }
  | { tipo: "assinou"; plano: string };

/** Como a troca para um plano funcionaria (para a tela mostrar antes de confirmar). */
export function simularTroca(atualId: string | null | undefined, novoId: string) {
  const t = precos();
  const atual = planoPorId(t, atualId);
  const novo = planoPorId(t, novoId);
  if (!atual || !novo || atual.id === novo.id) return null;
  return novo.creditosMes > atual.creditosMes
    ? { tipo: "upgrade" as const, cobrar: Math.max(0, novo.precoMes - atual.precoMes), creditos: novo.creditosMes - atual.creditosMes }
    : { tipo: "agendada" as const };
}

/**
 * Troca de plano.
 * - Para um plano com MAIS créditos (upgrade): imediata. Cobra a diferença de preço,
 *   credita a diferença de créditos agora, e a renovação segue na mesma data com o novo plano.
 *   Não há proporcional por dias: os créditos do período são entregues inteiros e não expiram.
 * - Para um plano com MENOS créditos: agendada para a próxima renovação, sem reembolso.
 */
export function trocarPlano(usuarioId: number, planoId: string): ResultadoTroca {
  const t = precos();
  const novo = planoPorId(t, planoId);
  if (!novo?.ativo) throw new ErroNegocio("Este plano não está disponível.");
  const atual = assinaturaDo(usuarioId);
  if (!atual) throw new ErroNegocio("Você ainda não tem assinatura.");
  if (atual.status !== "ativa") {
    assinar(usuarioId, planoId);
    return { tipo: "assinou", plano: novo.nome };
  }
  if (novo.id === atual.plano_id) {
    if (!atual.plano_proximo) throw new ErroNegocio(`Você já está no plano ${novo.nome}.`);
    executar("UPDATE assinaturas SET plano_proximo = NULL WHERE id = ?", atual.id);
    return { tipo: "cancelou_agendamento", plano: novo.nome };
  }

  const simulacao = simularTroca(atual.plano_id, novo.id);
  if (simulacao?.tipo === "upgrade") {
    transacao(() => {
      const faturaId =
        simulacao.cobrar > 0
          ? cobrar(usuarioId, simulacao.cobrar, `Upgrade para o plano ${novo.nome} (diferença do período)`)
          : undefined;
      lancar(usuarioId, simulacao.creditos, "assinatura", `Upgrade para o plano ${novo.nome}`, { faturaId });
      executar("UPDATE assinaturas SET plano_id = ?, plano_proximo = NULL WHERE id = ?", novo.id, atual.id);
    });
    return { tipo: "upgrade", plano: novo.nome, cobrado: simulacao.cobrar, creditos: simulacao.creditos };
  }

  executar("UPDATE assinaturas SET plano_proximo = ? WHERE id = ?", novo.id, atual.id);
  return { tipo: "agendada", plano: novo.nome, em: atual.periodo_fim };
}

/** Cancela a renovação. Os créditos já recebidos continuam valendo. */
export function cancelarAssinatura(usuarioId: number) {
  executar("UPDATE assinaturas SET status = 'cancelada' WHERE usuario_id = ? AND status = 'ativa'", usuarioId);
}

/** Renova os períodos vencidos de uma assinatura ativa (cobra e credita). */
export function renovarSeVencida(usuarioId: number) {
  const a = assinaturaDo(usuarioId);
  if (!a || a.status !== "ativa" || a.periodo_fim > agoraSql()) return;
  transacao(() => {
    // Troca agendada (para um plano menor) entra em vigor nesta renovação.
    const plano = a.plano_proximo && planoPorId(precos(), a.plano_proximo) ? a.plano_proximo : a.plano_id;
    let periodo = { inicio: a.periodo_inicio, fim: a.periodo_fim };
    // Limite de segurança: no máximo 12 períodos atrasados de uma vez.
    for (let i = 0; i < 12 && periodo.fim <= agoraSql(); i++) {
      periodo = cobrarPeriodo(usuarioId, plano, deSql(periodo.fim));
    }
    executar(
      "UPDATE assinaturas SET plano_id = ?, plano_proximo = NULL, periodo_inicio = ?, periodo_fim = ? WHERE id = ?",
      plano,
      periodo.inicio,
      periodo.fim,
      a.id,
    );
  });
}
