import "server-only";
import { PRECO_CREDITO_AVULSO, PACOTES_AVULSOS, planoPorId } from "@/domain/catalogo";
import { ErroNegocio, executar, transacao, um } from "../db";
import { adicionarMeses, agoraSql, deSql, paraSql } from "../datas";
import { lancar } from "./creditos";
import { cobrar } from "./pagamentos";

// Assinatura mensal. A cada período pago, os créditos do plano entram no extrato.
// Sem servidor de tarefas agendadas por enquanto: a renovação é verificada
// quando o cliente acessa a área (renovarSeVencida). Créditos acumulam até a
// regra definitiva de expiração ser decidida.

export interface Assinatura {
  id: number;
  plano_id: string;
  status: "ativa" | "cancelada";
  periodo_inicio: string;
  periodo_fim: string;
}

export const assinaturaDo = (usuarioId: number) =>
  um<Assinatura>(
    "SELECT id, plano_id, status, periodo_inicio, periodo_fim FROM assinaturas WHERE usuario_id = ?",
    usuarioId,
  );

function cobrarPeriodo(usuarioId: number, planoId: string, inicio: Date) {
  const plano = planoPorId(planoId);
  if (!plano) throw new ErroNegocio("Plano inválido.");
  const fim = adicionarMeses(inicio, 1);
  const faturaId = cobrar(usuarioId, plano.precoMes, `Plano ${plano.nome} · mensalidade`);
  lancar(usuarioId, plano.creditosMes, "assinatura", `Créditos do plano ${plano.nome}`, { faturaId });
  return { inicio: paraSql(inicio), fim: paraSql(fim) };
}

/** Primeira assinatura (no cadastro) ou reativação após cancelamento. */
export function assinar(usuarioId: number, planoId: string) {
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

/** Troca de plano: vale a partir da próxima renovação (sem cobrança proporcional). */
export function trocarPlano(usuarioId: number, planoId: string) {
  if (!planoPorId(planoId)) throw new ErroNegocio("Plano inválido.");
  const atual = assinaturaDo(usuarioId);
  if (!atual) throw new ErroNegocio("Você ainda não tem assinatura.");
  if (atual.status !== "ativa") return assinar(usuarioId, planoId);
  executar("UPDATE assinaturas SET plano_id = ? WHERE id = ?", planoId, atual.id);
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
    let periodo = { inicio: a.periodo_inicio, fim: a.periodo_fim };
    // Limite de segurança: no máximo 12 períodos atrasados de uma vez.
    for (let i = 0; i < 12 && periodo.fim <= agoraSql(); i++) {
      periodo = cobrarPeriodo(usuarioId, a.plano_id, deSql(periodo.fim));
    }
    executar("UPDATE assinaturas SET periodo_inicio = ?, periodo_fim = ? WHERE id = ?", periodo.inicio, periodo.fim, a.id);
  });
}

/** Compra avulsa de créditos, fora do plano. */
export function comprarCreditos(usuarioId: number, quantidade: number, metodoId?: number) {
  if (!PACOTES_AVULSOS.includes(quantidade)) throw new ErroNegocio("Pacote inválido.");
  transacao(() => {
    const faturaId = cobrar(usuarioId, quantidade * PRECO_CREDITO_AVULSO, `${quantidade} créditos avulsos`, metodoId);
    lancar(usuarioId, quantidade, "compra", `Compra de ${quantidade} créditos`, { faturaId });
  });
}
