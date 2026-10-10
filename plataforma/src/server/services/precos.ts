import "server-only";
import { PECAS } from "@/domain/catalogo";
import type { Custos } from "@/domain/custos";
import { PLANO_PERSONALIZADO, PRECOS_PADRAO, type TabelaPrecos, tabelaCreditos, validarTabela } from "@/domain/precos";
import { ErroNegocio, executar, transacao, um, varios } from "../db";
import type { Usuario } from "../auth";

// Tabela de preços guardada no banco (configuracoes.chave = 'precos').
// Todo o sistema lê daqui: site, cadastro, briefing, assinaturas, créditos e relatórios.

const CHAVE = "precos";
// Padrão definido pelo admin ("Definir padrão"): o que o "Restaurar padrão" traz de volta.
const CHAVE_PADRAO = "precos_padrao";

/** Preços em vigor. Campos ausentes no banco (ex.: depois de uma atualização do sistema) vêm do padrão. */
export const precos = (): TabelaPrecos => lerTabela(CHAVE);

/** Padrão para o "Restaurar padrão": o definido pelo admin ou, sem ele, o do sistema. */
export const padraoPrecos = (): TabelaPrecos => lerTabela(CHAVE_PADRAO);

function lerTabela(chave: string): TabelaPrecos {
  const linha = um<{ valor: string }>("SELECT valor FROM configuracoes WHERE chave = ?", chave);
  if (!linha) return PRECOS_PADRAO;
  try {
    const salvo = JSON.parse(linha.valor) as Partial<TabelaPrecos> & { adicionais?: { urgenciaPct?: number } };
    return validarTabela({
      ...PRECOS_PADRAO,
      ...salvo,
      pecas: { ...PRECOS_PADRAO.pecas, ...salvo.pecas },
      // Tabelas salvas antes de out/2026 guardavam a urgência dentro de "adicionais".
      urgenciaPct: salvo.urgenciaPct ?? salvo.adicionais?.urgenciaPct ?? PRECOS_PADRAO.urgenciaPct,
    }).tabela; // normaliza: descarta campos antigos (créditos fixos por peça, crédito avulso)
  } catch {
    return PRECOS_PADRAO;
  }
}

/** Premissas de custo achatadas em "rótulo → valor", para comparar e descrever no histórico. */
function rotulosDeCusto(c: Custos): Record<string, string> {
  const r: Record<string, string> = {
    "Hora do designer": `R$ ${c.valorHoraDesigner}`,
    "Hora do diretor": `R$ ${c.valorHoraDiretor}`,
    Impostos: `${c.impostosPct}%`,
    "Meta de margem": `${c.margemAlvoPct}%`,
    "Margem sobre repasses": `${c.margemRepassePct}%`,
    "Horas por formato extra": `${c.horasFormatoExtra}h`,
    "Horas do arquivo aberto": `${c.horasArquivoAberto}h`,
    "Horas da trilha": `${c.horasTrilha}h`,
    "Horas da trilha com efeitos": `${c.horasTrilhaEfeitos}h`,
    "Horas das legendas": `${c.horasLegendas}h`,
    "Roteiro até 30s": `R$ ${c.roteiro.ate30}`,
    "Roteiro até 90s": `R$ ${c.roteiro.ate90}`,
    "Locução até 30s": `R$ ${c.locucao.ate30}`,
    "Locução até 60s": `R$ ${c.locucao.ate60}`,
    "Locução até 90s": `R$ ${c.locucao.ate90}`,
    Retrabalho: `${c.retrabalhoPct}% + ${c.retrabalhoHorasDiretor}h diretor`,
  };
  for (const p of PECAS)
    for (const f of c.horas[p.id]) r[`${p.nome} até ${f.ate}s`] = `${f.designer}h designer + ${f.diretor}h diretor`;
  return r;
}

/** Resumo legível do que mudou, para o histórico. */
function resumirMudancas(antes: TabelaPrecos, depois: TabelaPrecos): string {
  const m: string[] = [];
  for (const p of PECAS) {
    const a = antes.pecas[p.id];
    const d = depois.pecas[p.id];
    if (a.diasUteis !== d.diasUteis) m.push(`${p.nome}: prazo ${a.diasUteis} → ${d.diasUteis} dias`);
    if (a.revisoes !== d.revisoes) m.push(`${p.nome}: ${a.revisoes} → ${d.revisoes} revisões`);
  }
  if (antes.valorCredito !== depois.valorCredito) m.push(`Valor do crédito: R$ ${antes.valorCredito} → R$ ${depois.valorCredito}`);
  if (antes.urgenciaPct !== depois.urgenciaPct) m.push(`Urgência: ${antes.urgenciaPct}% → ${depois.urgenciaPct}%`);
  for (const d of depois.planos) {
    const a = antes.planos.find((x) => x.id === d.id);
    if (!a) m.push(`Novo plano ${d.nome}`);
    else {
      if (a.precoMes !== d.precoMes) m.push(`${d.nome}: R$ ${a.precoMes} → R$ ${d.precoMes}`);
      if (a.creditosMes !== d.creditosMes) m.push(`${d.nome}: ${a.creditosMes} → ${d.creditosMes} cr/mês`);
      if (a.ativo !== d.ativo) m.push(`${d.nome}: ${d.ativo ? "reativado" : "ocultado"}`);
      if (a.nome !== d.nome) m.push(`Plano ${a.nome} renomeado para ${d.nome}`);
    }
  }
  for (const a of antes.planos) if (!depois.planos.some((d) => d.id === a.id)) m.push(`Plano ${a.nome} removido`);
  const ca = rotulosDeCusto(antes.custos);
  const cd = rotulosDeCusto(depois.custos);
  for (const [rotulo, valor] of Object.entries(cd)) if (ca[rotulo] !== valor) m.push(`${rotulo}: ${ca[rotulo] ?? "—"} → ${valor}`);
  // Efeito nos créditos calculados de cada peça (só a menor faixa, para o resumo não ficar enorme).
  const ta = tabelaCreditos(antes);
  const td = tabelaCreditos(depois);
  const efeito = PECAS.filter((p) => ta.pecas[p.id][0].creditos !== td.pecas[p.id][0].creditos).map(
    (p) => `${p.nome} ${ta.pecas[p.id][0].creditos} → ${td.pecas[p.id][0].creditos} cr`,
  );
  if (efeito.length && m.length) m.push(`Créditos recalculados: ${efeito.join(", ")}`);
  return m.join(" · ");
}

export function salvarPrecos(admin: Usuario, raw: unknown): string {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador altera os preços.", 403);
  const { tabela, erros } = validarTabela(raw);
  if (erros.length) throw new ErroNegocio(erros.slice(0, 4).join(" "));

  // Plano com assinantes não pode sumir da tabela (pode ser ocultado).
  const emUso = varios<{ plano_id: string }>("SELECT DISTINCT plano_id FROM assinaturas WHERE plano_id != ?", PLANO_PERSONALIZADO);
  const faltando = emUso.filter((a) => !tabela.planos.some((p) => p.id === a.plano_id));
  if (faltando.length) {
    const antes = precos();
    const nomes = faltando.map((f) => antes.planos.find((p) => p.id === f.plano_id)?.nome ?? f.plano_id);
    throw new ErroNegocio(`O plano ${nomes.join(", ")} tem assinantes e não pode ser removido. Desative-o em vez de remover.`);
  }

  const antes = precos();
  const resumo = resumirMudancas(antes, tabela);
  if (!resumo) return "Nada mudou.";
  transacao(() => {
    const valor = JSON.stringify(tabela);
    executar(
      `INSERT INTO configuracoes (chave, valor, atualizado_em, atualizado_por) VALUES (?, ?, datetime('now'), ?)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`,
      CHAVE,
      valor,
      admin.id,
    );
    executar(
      "INSERT INTO configuracoes_historico (chave, valor, autor_id, resumo) VALUES (?, ?, ?, ?)",
      CHAVE,
      valor,
      admin.id,
      resumo,
    );
  });
  return resumo;
}

/** Torna os preços em vigor o novo padrão (volta com "Restaurar padrão"). */
export function definirPadraoPrecos(admin: Usuario) {
  if (admin.papel !== "admin") throw new ErroNegocio("Somente o administrador altera os preços.", 403);
  const valor = JSON.stringify(precos());
  transacao(() => {
    executar(
      `INSERT INTO configuracoes (chave, valor, atualizado_em, atualizado_por) VALUES (?, ?, datetime('now'), ?)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`,
      CHAVE_PADRAO,
      valor,
      admin.id,
    );
    executar(
      "INSERT INTO configuracoes_historico (chave, valor, autor_id, resumo) VALUES (?, ?, ?, ?)",
      CHAVE,
      valor,
      admin.id,
      "Preços atuais definidos como padrão",
    );
  });
}

export interface MudancaPrecos {
  id: number;
  resumo: string;
  autor: string | null;
  criado_em: string;
}

export const historicoPrecos = (limite = 15) =>
  varios<MudancaPrecos>(
    `SELECT h.id, h.resumo, u.nome autor, h.criado_em FROM configuracoes_historico h
     LEFT JOIN usuarios u ON u.id = h.autor_id WHERE h.chave = ? ORDER BY h.id DESC LIMIT ?`,
    CHAVE,
    limite,
  );

/** Quantos assinantes ativos cada plano tem (para a tela de preços). */
export const assinantesPorPlano = () =>
  Object.fromEntries(
    varios<{ plano_id: string; n: number }>(
      "SELECT plano_id, COUNT(*) n FROM assinaturas WHERE status = 'ativa' GROUP BY plano_id",
    ).map((r) => [r.plano_id, r.n]),
  ) as Record<string, number>;
