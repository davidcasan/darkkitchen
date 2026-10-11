import "server-only";
import { type Briefing, atualizarBriefing } from "@/domain/briefing";
import { PECAS, type TipoPeca } from "@/domain/catalogo";
import { custoPadrao, faixaPara } from "@/domain/custos";
import { ErroNegocio, executar, transacao, um, varios } from "../db";
import type { Usuario } from "../auth";
import { precos } from "./precos";

// Financeiro > Colaboradores (out/2026): quanto cada pessoa da equipe trabalhou e tem a receber
// no mês, SEMPRE em HORAS PREVISTAS (decisão do dono: a plataforma não registra horas reais).
// - Designer do pedido: horas da peça (faixa da duração) + adicionais (formatos, trilha, legendas,
//   arquivo aberto) + retrabalho das rodadas pedidas pelo cliente (e das reprovações internas, se a
//   regra mandar pagar).
// - Diretor de arte: horas de curadoria da peça + horas por rodada, divididas entre quem fez os
//   controles de qualidade do pedido.
// - Mês do pedido: o da PRIMEIRA aprovação (horário de Brasília). Cancelados só contam se a regra
//   estiver ligada e o designer já tinha enviado versão.
// Repasses (locução, roteiro) não entram: são terceiros, não colaboradores.

export type FormaPagamento = "hora" | "peca" | "mensal" | "nenhum";
export const FORMAS: Record<FormaPagamento, string> = {
  hora: "Por hora",
  peca: "Por peça",
  mensal: "Fixo mensal",
  nenhum: "Sem pagamento (só custo)",
};
export const FORMAS_PAGAMENTO_REALIZADO = ["Pix", "Transferência", "Dinheiro", "Outro"] as const;

export interface FichaColaborador {
  forma: FormaPagamento;
  valorHora: number | null; // null = valor-hora padrão da tela Preços
  valorMensal: number | null;
  valoresPeca: Record<TipoPeca, number>;
}

export interface RegrasColaboradores {
  pagarCancelados: boolean; // horas da produção de pedidos cancelados depois de o designer enviar versão
  pagarReprovacaoInterna: boolean; // retrabalho do designer por reprovação no controle de qualidade
}
const REGRAS_PADRAO: RegrasColaboradores = { pagarCancelados: false, pagarReprovacaoInterna: false };

export interface LinhaApuracao {
  pedidoId: number;
  codigo: string;
  titulo: string;
  tipo: TipoPeca;
  duracao: number | null;
  papel: "designer" | "diretor";
  situacao: "aprovado" | "cancelado";
  data: string; // aprovação ou cancelamento
  rodadasCliente: number;
  reprovacoesInternas: number;
  horas: number;
  valor: number;
}

export interface ApuracaoColaborador {
  usuario: { id: number; nome: string; papel: string; ativo: number };
  ficha: FichaColaborador;
  linhas: LinhaApuracao[];
  horasDesigner: number;
  horasDiretor: number;
  valor: number;
  fechamento: Fechamento | null;
}

export interface Fechamento {
  id: number;
  mes: string;
  usuario_id: number;
  forma: FormaPagamento;
  horas_designer: number;
  horas_diretor: number;
  valor: number;
  detalhe: string;
  fechado_em: string;
  fechado_por_nome: string | null;
  pago_em: string | null;
  pago_por_nome: string | null;
  forma_pagamento: string | null;
  observacao: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const valoresPecaVazios = () => Object.fromEntries(PECAS.map((p) => [p.id, 0])) as Record<TipoPeca, number>;

export const mesValido = (mes: string | undefined | null) => (mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : null);
/** Mês atual no horário de Brasília (AAAA-MM). */
export const mesAtual = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
/** Data de hoje no horário de Brasília (AAAA-MM-DD). */
export const hojeBrasilia = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
export function mesVizinho(mes: string, delta: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
export function nomeDoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------- Ficha e regras ----------

export function fichaDe(usuarioId: number, papel: string): FichaColaborador {
  const f = um<{ forma: FormaPagamento; valor_hora: number | null; valor_mensal: number | null; valores_peca: string | null }>(
    "SELECT forma, valor_hora, valor_mensal, valores_peca FROM colaboradores_pagamento WHERE usuario_id = ?",
    usuarioId,
  );
  let valoresPeca = valoresPecaVazios();
  try {
    if (f?.valores_peca) valoresPeca = { ...valoresPeca, ...(JSON.parse(f.valores_peca) as Record<TipoPeca, number>) };
  } catch {}
  return {
    forma: f?.forma ?? (papel === "admin" ? "nenhum" : "hora"), // o admin trabalha como sênior, mas é só custo
    valorHora: f?.valor_hora ?? null,
    valorMensal: f?.valor_mensal ?? null,
    valoresPeca,
  };
}

export function salvarFicha(admin: Usuario, usuarioId: number, ficha: FichaColaborador) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador define pagamentos.", 403);
  const u = um<{ papel: string }>("SELECT papel FROM usuarios WHERE id = ?", usuarioId);
  if (!u || u.papel === "cliente") throw new ErroNegocio("Colaborador não encontrado.", 404);
  if (!(ficha.forma in FORMAS)) throw new ErroNegocio("Escolha a forma de pagamento.");
  const positivo = (n: number | null, nome: string) => {
    if (n === null) return null;
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new ErroNegocio(`Valor inválido em ${nome}.`);
    return r2(n);
  };
  if (ficha.forma === "mensal" && !ficha.valorMensal) throw new ErroNegocio("Informe o valor fixo mensal.");
  const pecas = valoresPecaVazios();
  for (const p of PECAS) pecas[p.id] = positivo(ficha.valoresPeca[p.id] ?? 0, p.nome) ?? 0;
  executar(
    `INSERT INTO colaboradores_pagamento (usuario_id, forma, valor_hora, valor_mensal, valores_peca, atualizado_em, atualizado_por)
     VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT (usuario_id) DO UPDATE SET forma = excluded.forma, valor_hora = excluded.valor_hora,
       valor_mensal = excluded.valor_mensal, valores_peca = excluded.valores_peca,
       atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`,
    usuarioId,
    ficha.forma,
    positivo(ficha.valorHora, "valor por hora"),
    positivo(ficha.valorMensal, "valor mensal"),
    JSON.stringify(pecas),
    admin.id,
  );
}

export function regrasColaboradores(): RegrasColaboradores {
  const l = um<{ valor: string }>("SELECT valor FROM configuracoes WHERE chave = 'colaboradores_regras'");
  try {
    return l ? { ...REGRAS_PADRAO, ...(JSON.parse(l.valor) as Partial<RegrasColaboradores>) } : REGRAS_PADRAO;
  } catch {
    return REGRAS_PADRAO;
  }
}

export function salvarRegras(admin: Usuario, r: RegrasColaboradores) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador altera as regras.", 403);
  executar(
    `INSERT INTO configuracoes (chave, valor, atualizado_em, atualizado_por) VALUES ('colaboradores_regras', ?, datetime('now'), ?)
     ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`,
    JSON.stringify({ pagarCancelados: Boolean(r.pagarCancelados), pagarReprovacaoInterna: Boolean(r.pagarReprovacaoInterna) }),
    admin.id,
  );
}

// ---------- Apuração do mês (horas previstas) ----------

interface PedidoApurado {
  id: number;
  codigo: string;
  titulo: string;
  tipo: TipoPeca;
  briefing: string;
  designer_id: number | null;
  revisoes_usadas: number;
  tentativas_internas: number;
  data: string;
  situacao: "aprovado" | "cancelado";
}

function pedidosDoMes(mes: string, regras: RegrasColaboradores): PedidoApurado[] {
  const aprovados = varios<PedidoApurado>(
    `SELECT p.id, p.codigo, p.titulo, p.tipo, p.briefing, p.designer_id, p.revisoes_usadas, p.tentativas_internas,
            e.primeiro data, 'aprovado' situacao
     FROM pedidos p
     JOIN (SELECT pedido_id, MIN(criado_em) primeiro FROM eventos WHERE para = 'aprovado' GROUP BY pedido_id) e ON e.pedido_id = p.id
     WHERE strftime('%Y-%m', e.primeiro, '-3 hours') = ?`,
    mes,
  );
  if (!regras.pagarCancelados) return aprovados;
  const cancelados = varios<PedidoApurado>(
    `SELECT p.id, p.codigo, p.titulo, p.tipo, p.briefing, p.designer_id, p.revisoes_usadas, p.tentativas_internas,
            e.quando data, 'cancelado' situacao
     FROM pedidos p
     JOIN (SELECT pedido_id, MAX(criado_em) quando FROM eventos WHERE tipo = 'cancelado' GROUP BY pedido_id) e ON e.pedido_id = p.id
     WHERE p.status = 'cancelado' AND strftime('%Y-%m', e.quando, '-3 hours') = ?
       AND NOT EXISTS (SELECT 1 FROM eventos x WHERE x.pedido_id = p.id AND x.para = 'aprovado')
       AND EXISTS (SELECT 1 FROM eventos v WHERE v.pedido_id = p.id AND v.tipo = 'versao_enviada')`,
    mes,
  );
  return [...aprovados, ...cancelados];
}

/** Apuração ao vivo do mês para toda a equipe (designers, diretores e admins). */
function apurarAoVivo(mes: string) {
  const tabela = precos();
  const c = tabela.custos;
  const regras = regrasColaboradores();
  const linhas = new Map<number, LinhaApuracao[]>();
  const add = (uid: number, l: LinhaApuracao) => linhas.set(uid, [...(linhas.get(uid) ?? []), l]);

  for (const p of pedidosDoMes(mes, regras)) {
    const b: Briefing = atualizarBriefing(JSON.parse(p.briefing));
    if (!b.tipo) continue;
    const base = faixaPara(c, b.tipo, b.duracao ?? 0);
    const semRodadas = custoPadrao(b, c, 0);
    const comum = {
      pedidoId: p.id,
      codigo: p.codigo,
      titulo: p.titulo,
      tipo: p.tipo,
      duracao: b.duracao,
      situacao: p.situacao,
      data: p.data,
      rodadasCliente: p.revisoes_usadas,
      reprovacoesInternas: p.tentativas_internas,
      valor: 0,
    };
    // Designer: produção + adicionais + retrabalho das rodadas pagas.
    if (p.designer_id) {
      const rodadasPagas = p.revisoes_usadas + (regras.pagarReprovacaoInterna ? p.tentativas_internas : 0);
      const horas = semRodadas.horasDesigner + rodadasPagas * base.designer * (c.retrabalhoPct / 100);
      add(p.designer_id, { ...comum, papel: "designer", horas: r2(horas) });
    }
    // Diretor: curadoria + horas por rodada, divididas entre quem fez os controles de qualidade.
    const horasDiretor = semRodadas.horasDiretor + (p.revisoes_usadas + p.tentativas_internas) * c.retrabalhoHorasDiretor;
    let revisores = varios<{ autor_id: number; n: number }>(
      `SELECT autor_id, COUNT(*) n FROM eventos WHERE pedido_id = ? AND tipo IN ('qualidade_aprovada', 'qualidade_reprovada')
       AND autor_id IS NOT NULL GROUP BY autor_id`,
      p.id,
    );
    if (!revisores.length)
      revisores = varios<{ autor_id: number; n: number }>(
        "SELECT autor_id, 1 n FROM eventos WHERE pedido_id = ? AND tipo = 'atribuido' AND autor_id IS NOT NULL ORDER BY id DESC LIMIT 1",
        p.id,
      );
    const totalRevisoes = revisores.reduce((s, x) => s + x.n, 0);
    for (const rv of revisores)
      add(rv.autor_id, { ...comum, papel: "diretor", horas: r2((horasDiretor * rv.n) / totalRevisoes) });
  }

  const equipe = varios<{ id: number; nome: string; papel: string; ativo: number }>(
    `SELECT id, nome, papel, ativo FROM usuarios WHERE papel IN ('designer', 'diretor', 'admin') ORDER BY papel = 'admin', nome`,
  );
  const resultado: Omit<ApuracaoColaborador, "fechamento">[] = [];
  for (const u of equipe) {
    const ls = (linhas.get(u.id) ?? []).sort((a, b) => a.data.localeCompare(b.data));
    if (!u.ativo && !ls.length) continue;
    const ficha = fichaDe(u.id, u.papel);
    const horaDe = (papel: "designer" | "diretor") => ficha.valorHora ?? (papel === "designer" ? c.valorHoraDesigner : c.valorHoraDiretor);
    for (const l of ls) {
      if (ficha.forma === "hora") l.valor = r2(l.horas * horaDe(l.papel));
      else if (ficha.forma === "peca")
        l.valor =
          l.papel === "designer"
            ? r2((ficha.valoresPeca[l.tipo] ?? 0) * (l.situacao === "cancelado" ? 0.5 : 1)) // cancelado: metade da peça
            : r2(l.horas * c.valorHoraDiretor); // curadoria de quem é pago por peça: valor-hora padrão do diretor
      else l.valor = 0; // mensal (fixo) ou só custo
    }
    const horasDesigner = r2(ls.filter((l) => l.papel === "designer").reduce((s, l) => s + l.horas, 0));
    const horasDiretor = r2(ls.filter((l) => l.papel === "diretor").reduce((s, l) => s + l.horas, 0));
    const valor = ficha.forma === "mensal" ? (ficha.valorMensal ?? 0) : r2(ls.reduce((s, l) => s + l.valor, 0));
    resultado.push({ usuario: u, ficha, linhas: ls, horasDesigner, horasDiretor, valor });
  }
  return resultado;
}

const fechamentosDoMes = (mes: string) =>
  varios<Fechamento>(
    `SELECT f.*, a.nome fechado_por_nome, b.nome pago_por_nome FROM colaboradores_fechamentos f
     LEFT JOIN usuarios a ON a.id = f.fechado_por LEFT JOIN usuarios b ON b.id = f.pago_por WHERE f.mes = ?`,
    mes,
  );

/** Apuração do mês: quem já foi fechado aparece com os números congelados no fechamento. */
export function apuracaoDoMes(mes: string): ApuracaoColaborador[] {
  const fechados = fechamentosDoMes(mes);
  return apurarAoVivo(mes).map((a) => {
    const f = fechados.find((x) => x.usuario_id === a.usuario.id) ?? null;
    if (!f) return { ...a, fechamento: null };
    let linhas = a.linhas;
    try {
      linhas = JSON.parse(f.detalhe) as LinhaApuracao[];
    } catch {}
    return {
      ...a,
      ficha: { ...a.ficha, forma: f.forma },
      linhas,
      horasDesigner: f.horas_designer,
      horasDiretor: f.horas_diretor,
      valor: f.valor,
      fechamento: f,
    };
  });
}

export function apuracaoDe(usuarioId: number, mes: string) {
  return apuracaoDoMes(mes).find((a) => a.usuario.id === usuarioId) ?? null;
}

// ---------- Fechamento e pagamento ----------

export function fecharMes(admin: Usuario, mes: string, usuarioId: number | null) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador fecha o mês.", 403);
  if (!mesValido(mes)) throw new ErroNegocio("Mês inválido.");
  if (mes > mesAtual()) throw new ErroNegocio("Esse mês ainda não começou.");
  const alvos = apuracaoDoMes(mes).filter(
    (a) => !a.fechamento && (usuarioId ? a.usuario.id === usuarioId : a.linhas.length > 0 || a.ficha.forma === "mensal"),
  );
  if (!alvos.length) throw new ErroNegocio(usuarioId ? "Este colaborador já está fechado neste mês." : "Nada a fechar neste mês.");
  transacao(() => {
    for (const a of alvos)
      executar(
        `INSERT INTO colaboradores_fechamentos (mes, usuario_id, forma, horas_designer, horas_diretor, valor, detalhe, fechado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        mes,
        a.usuario.id,
        a.ficha.forma,
        a.horasDesigner,
        a.horasDiretor,
        a.valor,
        JSON.stringify(a.linhas),
        admin.id,
      );
  });
  return alvos.length;
}

export function reabrirMes(admin: Usuario, mes: string, usuarioId: number) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador reabre o mês.", 403);
  const f = um<{ pago_em: string | null }>("SELECT pago_em FROM colaboradores_fechamentos WHERE mes = ? AND usuario_id = ?", mes, usuarioId);
  if (!f) throw new ErroNegocio("Este mês não está fechado para o colaborador.");
  if (f.pago_em) throw new ErroNegocio("Já está pago. Desfaça o pagamento antes de reabrir.");
  executar("DELETE FROM colaboradores_fechamentos WHERE mes = ? AND usuario_id = ?", mes, usuarioId);
}

export function marcarPago(admin: Usuario, mes: string, usuarioId: number, dados: { data: string; forma: string; observacao: string }) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador registra pagamentos.", 403);
  const f = um<{ id: number; pago_em: string | null }>(
    "SELECT id, pago_em FROM colaboradores_fechamentos WHERE mes = ? AND usuario_id = ?",
    mes,
    usuarioId,
  );
  if (!f) throw new ErroNegocio("Feche o mês do colaborador antes de registrar o pagamento.");
  if (f.pago_em) throw new ErroNegocio("Este pagamento já foi registrado.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data)) throw new ErroNegocio("Informe a data do pagamento.");
  if (!(FORMAS_PAGAMENTO_REALIZADO as readonly string[]).includes(dados.forma)) throw new ErroNegocio("Escolha como foi pago.");
  executar(
    "UPDATE colaboradores_fechamentos SET pago_em = ?, pago_por = ?, forma_pagamento = ?, observacao = ? WHERE id = ?",
    dados.data,
    admin.id,
    dados.forma,
    dados.observacao.trim().slice(0, 500) || null,
    f.id,
  );
}

export function desfazerPagamento(admin: Usuario, mes: string, usuarioId: number) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador altera pagamentos.", 403);
  executar(
    "UPDATE colaboradores_fechamentos SET pago_em = NULL, pago_por = NULL, forma_pagamento = NULL, observacao = NULL WHERE mes = ? AND usuario_id = ?",
    mes,
    usuarioId,
  );
}

// ---------- Exportação (contador) ----------

const num = (n: number) => String(r2(n)).replace(".", ",");
const cel = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV do mês para planilha (separador ";" e vírgula decimal, como o Excel em português espera). */
export function csvDoMes(mes: string) {
  const nomesPeca = Object.fromEntries(PECAS.map((p) => [p.id, p.nome])) as Record<TipoPeca, string>;
  const linhas = [
    ["Mês", "Colaborador", "Papel", "Forma de pagamento", "Pedido", "Título", "Peça", "Duração (s)", "Função", "Situação", "Data", "Rodadas do cliente", "Reprovações internas", "Horas previstas", "Valor (R$)", "Fechado", "Pago em"].join(";"),
  ];
  for (const a of apuracaoDoMes(mes)) {
    const fechado = a.fechamento ? "sim" : "não";
    const pago = a.fechamento?.pago_em ?? "";
    for (const l of a.linhas)
      linhas.push(
        [mes, a.usuario.nome, a.usuario.papel, FORMAS[a.ficha.forma], l.codigo, l.titulo, nomesPeca[l.tipo], String(l.duracao ?? ""), l.papel, l.situacao, l.data.slice(0, 10), String(l.rodadasCliente), String(l.reprovacoesInternas), num(l.horas), num(l.valor), fechado, pago]
          .map(cel)
          .join(";"),
      );
    if (a.ficha.forma === "mensal")
      linhas.push([mes, a.usuario.nome, a.usuario.papel, FORMAS.mensal, "", "Valor fixo mensal", "", "", "", "", "", "", "", "", num(a.valor), fechado, pago].map(cel).join(";"));
  }
  return "﻿" + linhas.join("\r\n") + "\r\n";
}
