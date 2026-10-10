"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { definirPadraoPrecosAction, salvarPrecosAction } from "@/app/actions/admin";
import { PECAS, formatarReais, type TipoPeca } from "@/domain/catalogo";
import { type Custos, type FaixaHoras, custoDaFaixa } from "@/domain/custos";
import { type Plano, type PrazoPeca, type TabelaPrecos, tabelaCreditos } from "@/domain/precos";
import styles from "./precos.module.css";

const pct = (v: number | null) => (v === null || !Number.isFinite(v) ? "—" : `${Math.round(v * 100)}%`);
const reais2 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function Numero({
  valor,
  onChange,
  rotulo,
  min = 0,
  passo = 1,
  sufixo,
}: {
  valor: number;
  onChange: (n: number) => void;
  rotulo: string;
  min?: number;
  passo?: number;
  sufixo?: string;
}) {
  return (
    <label className={styles.numero}>
      <span>{rotulo}</span>
      <span className={styles.entrada}>
        <input
          type="number"
          className="txt"
          min={min}
          step={passo}
          value={Number.isFinite(valor) ? valor : ""}
          onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
        />
        {sufixo && <small>{sufixo}</small>}
      </span>
    </label>
  );
}

export function EditorPrecos({
  inicial,
  padrao,
  assinantes,
}: {
  inicial: TabelaPrecos;
  padrao: TabelaPrecos;
  assinantes: Record<string, number>;
}) {
  const router = useRouter();
  const [t, setT] = useState<TabelaPrecos>(inicial);
  const [estado, setEstado] = useState<{ salvando: boolean; erro?: string; ok?: string }>({ salvando: false });
  const alterado = JSON.stringify(t) !== JSON.stringify(inicial);
  const c = t.custos;
  const impostos = c.impostosPct / 100;
  const meta = c.margemAlvoPct / 100;
  const fator = 1 - impostos - meta; // fração do preço que cobre o custo
  const valido = fator > 0 && t.valorCredito > 0;
  const tc = valido ? tabelaCreditos(t) : null;
  const fatorRepasse = 1 - impostos - c.margemRepassePct / 100; // repasses (roteiro, locução) usam margem própria
  // Adicionais com custo em R$ e créditos calculados.
  const adicionais = tc
    ? [
        { nome: "Formato extra (cada)", custo: c.horasFormatoExtra * c.valorHoraDesigner, creditos: tc.formatoExtra, repasse: false },
        { nome: "Arquivo aberto (.aep)", custo: c.horasArquivoAberto * c.valorHoraDesigner, creditos: tc.arquivoAberto, repasse: false },
        { nome: "Só trilha", custo: c.horasTrilha * c.valorHoraDesigner, creditos: tc.trilha, repasse: false },
        { nome: "Trilha e efeitos sonoros", custo: c.horasTrilhaEfeitos * c.valorHoraDesigner, creditos: tc.trilhaEfeitos, repasse: false },
        { nome: "Legendas", custo: c.horasLegendas * c.valorHoraDesigner, creditos: tc.legendas, repasse: false },
        { nome: "Roteiro até 30s", custo: c.roteiro.ate30, creditos: tc.roteiro.ate30, repasse: true },
        { nome: "Roteiro até 90s", custo: c.roteiro.ate90, creditos: tc.roteiro.ate90, repasse: true },
        { nome: "Locução até 30s", custo: c.locucao.ate30, creditos: tc.locucao.ate30, repasse: true },
        { nome: "Locução até 60s", custo: c.locucao.ate60, creditos: tc.locucao.ate60, repasse: true },
        { nome: "Locução até 90s", custo: c.locucao.ate90, creditos: tc.locucao.ate90, repasse: true },
      ]
    : [];

  const setPrazo = (id: TipoPeca, campo: keyof PrazoPeca, v: number) =>
    setT((x) => ({ ...x, pecas: { ...x.pecas, [id]: { ...x.pecas[id], [campo]: v } } }));
  const setPlano = (i: number, dados: Partial<Plano>) =>
    setT((x) => ({ ...x, planos: x.planos.map((p, j) => (j === i ? { ...p, ...dados } : dados.destaque ? { ...p, destaque: false } : p)) }));
  type CampoCusto = Exclude<keyof Custos, "horas" | "locucao" | "roteiro">;
  const setCusto = (campo: CampoCusto, v: number) => setT((x) => ({ ...x, custos: { ...x.custos, [campo]: v } }));
  const setLocucao = (campo: keyof Custos["locucao"], v: number) =>
    setT((x) => ({ ...x, custos: { ...x.custos, locucao: { ...x.custos.locucao, [campo]: v } } }));
  const setRoteiro = (campo: keyof Custos["roteiro"], v: number) =>
    setT((x) => ({ ...x, custos: { ...x.custos, roteiro: { ...x.custos.roteiro, [campo]: v } } }));
  const setFaixa = (tipo: TipoPeca, i: number, campo: keyof Omit<FaixaHoras, "ate">, v: number) =>
    setT((x) => ({
      ...x,
      custos: {
        ...x.custos,
        horas: { ...x.custos.horas, [tipo]: x.custos.horas[tipo].map((f, j) => (j === i ? { ...f, [campo]: v } : f)) },
      },
    }));

  async function salvar() {
    setEstado({ salvando: true });
    const r = await salvarPrecosAction(t);
    if (r?.erro) return setEstado({ salvando: false, erro: r.erro });
    setEstado({ salvando: false, ok: r?.ok });
    router.refresh();
  }

  const restaurar = () => {
    if (!window.confirm("Voltar todos os valores para o padrão? Nada é salvo até você clicar em Salvar.")) return;
    setT(padrao);
  };

  async function definirPadrao() {
    if (!window.confirm("Usar os preços salvos agora como padrão? O \"Restaurar padrão\" passa a voltar para eles.")) return;
    setEstado({ salvando: true });
    const r = await definirPadraoPrecosAction();
    setEstado(r?.erro ? { salvando: false, erro: r.erro } : { salvando: false, ok: r?.ok });
    router.refresh();
  }
  const ehPadrao = JSON.stringify(inicial) === JSON.stringify(padrao);

  /** Atividades de referência para mostrar quanto cada plano rende. */
  const referencias: { rotulo: string; tipo: TipoPeca; faixa: number }[] = [
    { rotulo: "posts de 10s", tipo: "post", faixa: 2 },
    { rotulo: "vídeos curtos de 30s", tipo: "curto", faixa: 1 },
    { rotulo: "explicativos de 60s", tipo: "explicativo", faixa: 1 },
  ];

  return (
    <div className={styles.editor}>
      {/* ---------- Valor do crédito ---------- */}
      <section className="card">
        <h2>Valor do crédito</h2>
        <div className={styles.grade}>
          <Numero rotulo="Valor-base de 1 crédito" sufixo="R$" passo={0.01} min={0.01} valor={t.valorCredito} onChange={(v) => setT((x) => ({ ...x, valorCredito: v }))} />
        </div>
        <p className="muted small" style={{ margin: "10px 0 16px" }}>
          Cada atividade custa os créditos necessários para cobrir o custo de produção, os impostos ({c.impostosPct}%) e a meta de
          margem ({c.margemAlvoPct}%): <b>créditos = custo ÷ {fator > 0 ? fator.toFixed(2).replace(".", ",") : "?"} ÷ valor do crédito</b>
          , arredondado para cima. Para mudar o custo, use a seção Custos de produção.
        </p>

        {!valido || !tc ? (
          <p className="alerta alerta-erro">Impostos + meta de margem precisam somar menos de 100% e o valor do crédito precisa ser maior que zero.</p>
        ) : (
          <>
            <h3 className={styles.sub}>Créditos por peça e duração</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="extrato">
                <thead>
                  <tr>
                    <th>Peça</th>
                    <th className="num">Custo</th>
                    <th className="num">Preço mínimo</th>
                    <th className="num">Créditos</th>
                    <th className="num">Revisão extra</th>
                  </tr>
                </thead>
                <tbody>
                  {PECAS.flatMap((p) =>
                    tc.pecas[p.id].map((f) => (
                      <tr key={`${p.id}-${f.ate}`}>
                        <td>
                          {p.nome} <small className="muted">{f.ate}s</small>
                        </td>
                        <td className="num">{formatarReais(f.custo)}</td>
                        <td className="num">{formatarReais(f.custo / fator)}</td>
                        <td className="num">
                          <b>{f.creditos} cr</b>
                        </td>
                        <td className="num">{f.revisaoExtra} cr</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>

            <h3 className={styles.sub}>Créditos por adicional</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="extrato">
                <thead>
                  <tr>
                    <th>Adicional</th>
                    <th className="num">Custo</th>
                    <th className="num">Preço mínimo</th>
                    <th className="num">Créditos</th>
                  </tr>
                </thead>
                <tbody>
                  {adicionais.map((a) => (
                    <tr key={a.nome}>
                      <td>
                        {a.nome} {a.repasse && <small className="muted">(repasse, margem de {c.margemRepassePct}%)</small>}
                      </td>
                      <td className="num">{formatarReais(a.custo)}</td>
                      <td className="num">{formatarReais(a.custo / (a.repasse ? fatorRepasse : fator))}</td>
                      <td className="num">
                        <b>{a.creditos} cr</b>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      Sem som, sem legendas <small className="muted">(sem custo)</small>
                    </td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                    <td className="num">0 cr</td>
                  </tr>
                  <tr>
                    <td>Entrega urgente</td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                    <td className="num">
                      <b>+{t.urgenciaPct}% do total</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ---------- Planos ---------- */}
      <section className="card">
        <h2>Planos (pacotes de créditos)</h2>
        <p className="muted small" style={{ marginBottom: 14 }}>
          A única forma de o cliente comprar créditos. Mudanças de preço valem para novas assinaturas e na próxima renovação de
          quem já assina. Plano com assinantes não pode ser removido, só retirado da venda. O plano Personalizado
          não fica aqui: créditos e valor são combinados com cada cliente e aplicados na conta dele, em Contas.
        </p>
        <div className={styles.planos}>
          {t.planos.map((p, i) => {
            const valorBase = p.creditosMes * t.valorCredito;
            const valorCreditoPlano = p.creditosMes > 0 ? p.precoMes / p.creditosMes : 0;
            const desconto = valorBase > 0 ? 1 - p.precoMes / valorBase : 0;
            // Margem quando o crédito é vendido mais barato que o valor-base (custo fica igual).
            const margemPlano = valorCreditoPlano > 0 ? 1 - impostos - fator * (t.valorCredito / valorCreditoPlano) : null;
            const nAssinantes = assinantes[p.id] ?? 0;
            return (
              <div key={p.id || `novo-${i}`} className={styles.plano} data-inativo={!p.ativo}>
                <div className={styles.linha}>
                  <label className={styles.numero} style={{ flex: "2 1 160px" }}>
                    <span>Nome</span>
                    <input className="txt" value={p.nome} onChange={(e) => setPlano(i, { nome: e.target.value })} />
                  </label>
                  <Numero rotulo="Créditos por mês" valor={p.creditosMes} min={1} onChange={(v) => setPlano(i, { creditosMes: v })} />
                  <Numero rotulo="Preço por mês" sufixo="R$" valor={p.precoMes} min={1} passo={0.01} onChange={(v) => setPlano(i, { precoMes: v })} />
                </div>
                <label className={styles.numero}>
                  <span>Descrição curta (aparece no site)</span>
                  <input className="txt" value={p.resumo} maxLength={140} onChange={(e) => setPlano(i, { resumo: e.target.value })} />
                </label>
                {valido && tc && (
                  <div className={styles.calibra}>
                    <span>
                      Valor-base: {p.creditosMes} cr × {reais2(t.valorCredito)} = <b>{formatarReais(valorBase)}</b> · seu preço{" "}
                      {formatarReais(p.precoMes)} ({desconto >= 0 ? `${pct(desconto)} de desconto` : `${pct(-desconto)} acima`}) ·
                      crédito a {reais2(valorCreditoPlano)}
                    </span>
                    <span className={styles.analise} data-ok={margemPlano !== null && margemPlano >= meta}>
                      Margem estimada: {pct(margemPlano)} (meta {c.margemAlvoPct}%)
                    </span>
                    <span className="muted">
                      Rende por mês:{" "}
                      {referencias
                        .map((r) => {
                          const cr = tc.pecas[r.tipo][r.faixa].creditos;
                          return `${Math.floor(p.creditosMes / cr)} ${r.rotulo}`;
                        })
                        .join(" ou ")}
                    </span>
                  </div>
                )}
                <div className="row-between" style={{ marginTop: 8 }}>
                  <span className="row small">
                    <label className="row">
                      <input type="checkbox" checked={p.ativo} onChange={(e) => setPlano(i, { ativo: e.target.checked })} />
                      À venda
                    </label>
                    <label className="row">
                      <input type="radio" name="destaque" checked={p.destaque} onChange={() => setPlano(i, { destaque: true })} />
                      Destaque no site
                    </label>
                    <span className="muted">
                      {nAssinantes} {nAssinantes === 1 ? "assinante" : "assinantes"}
                    </span>
                  </span>
                  {nAssinantes === 0 && (
                    <button
                      type="button"
                      className="link small"
                      style={{ color: "var(--danger)" }}
                      onClick={() => setT((x) => ({ ...x, planos: x.planos.filter((_, j) => j !== i) }))}
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="btn btn-sm"
          style={{ marginTop: 12 }}
          onClick={() =>
            setT((x) => ({
              ...x,
              planos: [...x.planos, { id: "", nome: "", creditosMes: 30, precoMes: 1300, resumo: "", destaque: false, ativo: true }],
            }))
          }
        >
          + Novo plano
        </button>
      </section>

      {/* ---------- Prazos, revisões e urgência ---------- */}
      <section className="card">
        <h2>Prazos, revisões e urgência</h2>
        <div className={styles.tabelaHoras}>
          {PECAS.map((p) => (
            <div key={p.id} className={styles.faixa}>
              <span className={styles.faixaNome}>
                <b>{p.nome}</b>
              </span>
              <Numero rotulo="Prazo" sufixo="dias úteis" valor={t.pecas[p.id].diasUteis} min={1} onChange={(v) => setPrazo(p.id, "diasUteis", v)} />
              <Numero rotulo="Revisões incluídas" valor={t.pecas[p.id].revisoes} onChange={(v) => setPrazo(p.id, "revisoes", v)} />
              <span />
            </div>
          ))}
        </div>
        <div className={styles.grade} style={{ marginTop: 12 }}>
          <Numero rotulo="Entrega urgente" sufixo="% a mais em créditos" valor={t.urgenciaPct} onChange={(v) => setT((x) => ({ ...x, urgenciaPct: v }))} />
        </div>
      </section>

      {/* ---------- Custos de produção ---------- */}
      <section className="card">
        <h2>Custos de produção</h2>
        <p className="muted small" style={{ marginBottom: 14 }}>
          Premissas que definem o custo de cada atividade e, com o valor do crédito, quantos créditos ela custa. Também alimentam
          os Relatórios. Não aparecem para o cliente.
        </p>

        <h3 className={styles.sub}>Valores-base</h3>
        <div className={styles.grade}>
          <Numero rotulo="Hora do designer" sufixo="R$" passo={0.01} valor={c.valorHoraDesigner} onChange={(v) => setCusto("valorHoraDesigner", v)} />
          <Numero rotulo="Hora do diretor de arte" sufixo="R$" passo={0.01} valor={c.valorHoraDiretor} onChange={(v) => setCusto("valorHoraDiretor", v)} />
          <Numero rotulo="Impostos e taxas" sufixo="% da receita" passo={0.1} valor={c.impostosPct} onChange={(v) => setCusto("impostosPct", v)} />
          <Numero rotulo="Meta de margem bruta" sufixo="%" valor={c.margemAlvoPct} onChange={(v) => setCusto("margemAlvoPct", v)} />
          <Numero rotulo="Margem sobre repasses" sufixo="% (roteiro e locução)" valor={c.margemRepassePct} onChange={(v) => setCusto("margemRepassePct", v)} />
        </div>

        <h3 className={styles.sub}>Horas por peça e duração</h3>
        <p className="muted small" style={{ marginBottom: 10 }}>
          Cada duração que o cliente pode escolher tem as suas horas. A mais longa precisa ter mais horas que a anterior.
        </p>
        <div className={styles.tabelaHoras}>
          {PECAS.map((p) =>
            c.horas[p.id].map((f, i) => (
              <div key={`${p.id}-${f.ate}`} className={styles.faixa}>
                <span className={styles.faixaNome}>
                  <b>{p.nome}</b> <small className="muted">{f.ate}s</small>
                </span>
                <Numero rotulo="Designer" sufixo="h" passo={0.25} valor={f.designer} onChange={(v) => setFaixa(p.id, i, "designer", v)} />
                <Numero rotulo="Diretor" sufixo="h" passo={0.25} valor={f.diretor} onChange={(v) => setFaixa(p.id, i, "diretor", v)} />
                <span className={styles.faixaCusto}>{formatarReais(custoDaFaixa(c, f))}</span>
              </div>
            )),
          )}
        </div>

        <h3 className={styles.sub}>Adicionais e retrabalho</h3>
        <div className={styles.grade}>
          <Numero rotulo="Formato extra" sufixo="h de designer" passo={0.25} valor={c.horasFormatoExtra} onChange={(v) => setCusto("horasFormatoExtra", v)} />
          <Numero rotulo="Arquivo aberto (.aep)" sufixo="h de designer" passo={0.25} valor={c.horasArquivoAberto} onChange={(v) => setCusto("horasArquivoAberto", v)} />
          <Numero rotulo="Só trilha" sufixo="h de designer" passo={0.25} valor={c.horasTrilha} onChange={(v) => setCusto("horasTrilha", v)} />
          <Numero rotulo="Trilha e efeitos sonoros" sufixo="h de designer" passo={0.25} valor={c.horasTrilhaEfeitos} onChange={(v) => setCusto("horasTrilhaEfeitos", v)} />
          <Numero rotulo="Legendas" sufixo="h de designer" passo={0.25} valor={c.horasLegendas} onChange={(v) => setCusto("horasLegendas", v)} />
          <Numero rotulo="Roteiro até 30s" sufixo="R$ (repasse)" valor={c.roteiro.ate30} onChange={(v) => setRoteiro("ate30", v)} />
          <Numero rotulo="Roteiro até 90s" sufixo="R$ (repasse)" valor={c.roteiro.ate90} onChange={(v) => setRoteiro("ate90", v)} />
          <Numero rotulo="Locução até 30s" sufixo="R$ (repasse)" valor={c.locucao.ate30} onChange={(v) => setLocucao("ate30", v)} />
          <Numero rotulo="Locução até 60s" sufixo="R$ (repasse)" valor={c.locucao.ate60} onChange={(v) => setLocucao("ate60", v)} />
          <Numero rotulo="Locução até 90s" sufixo="R$ (repasse)" valor={c.locucao.ate90} onChange={(v) => setLocucao("ate90", v)} />
          <Numero rotulo="Retrabalho do designer" sufixo="% das horas, por rodada" valor={c.retrabalhoPct} onChange={(v) => setCusto("retrabalhoPct", v)} />
          <Numero rotulo="Retrabalho do diretor" sufixo="h por rodada" passo={0.25} valor={c.retrabalhoHorasDiretor} onChange={(v) => setCusto("retrabalhoHorasDiretor", v)} />
        </div>
      </section>

      <div className={styles.barra}>
        <span className="small muted">{alterado ? "Há alterações não salvas." : "Tudo salvo."}</span>
        <span className="row">
          <button type="button" className="link small" onClick={restaurar}>
            Restaurar padrão
          </button>
          <button
            type="button"
            className="link small"
            onClick={definirPadrao}
            disabled={estado.salvando || alterado || ehPadrao}
            title={alterado ? "Salve as alterações antes de defini-las como padrão." : ehPadrao ? "Os preços salvos já são o padrão." : undefined}
          >
            Definir padrão
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={estado.salvando || !alterado}>
            {estado.salvando ? "Salvando..." : "Salvar preços"}
          </button>
        </span>
      </div>
      {estado.erro && <p className="alerta alerta-erro">{estado.erro}</p>}
      {estado.ok && <p className="alerta alerta-ok">{estado.ok}</p>}
    </div>
  );
}
