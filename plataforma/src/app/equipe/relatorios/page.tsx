import type { Metadata } from "next";
import Link from "next/link";
import { GraficoBarras } from "@/components/app/GraficoBarras";
import { formatarReais } from "@/domain/catalogo";
import { exigirUsuario } from "@/server/auth";
import { type CodigoPeriodo, PERIODOS, relatorio } from "@/server/services/relatorios";
import styles from "./relatorios.module.css";

export const metadata: Metadata = { title: "Relatórios" };

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const num = (v: number | null, casas = 1) => (v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas }));
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default async function RelatoriosPage({ searchParams }: PageProps<"/equipe/relatorios">) {
  const admin = await exigirUsuario(["admin"]);
  const { p } = await searchParams;
  const codigo: CodigoPeriodo = PERIODOS.some((x) => x.id === p) ? (p as CodigoPeriodo) : "mes";
  const r = relatorio(admin, codigo);
  const { faturamento: f, creditos: c, jobs: j, margem: m } = r;
  const acimaDaMeta = m.percentual !== null && m.percentual >= m.alvo;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Relatórios</h1>
          <p>Faturamento, créditos, fluxo de jobs e margem estimada.</p>
        </div>
      </div>

      <nav className="chips" aria-label="Período" style={{ marginBottom: 16 }}>
        {PERIODOS.map((x) => (
          <Link key={x.id} href={`/equipe/relatorios?p=${x.id}`} className="chip" aria-current={codigo === x.id ? "page" : undefined}>
            {x.rotulo}
          </Link>
        ))}
      </nav>

      <div className="grid-kpi" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <span>Faturado no período</span>
          <b>{formatarReais(f.faturado)}</b>
          <small>
            {f.avulsos > 0
              ? `Mensalidades ${formatarReais(f.mensalidades)} · compras avulsas antigas ${formatarReais(f.avulsos)}`
              : "Mensalidades das assinaturas"}
          </small>
        </div>
        <div className="kpi">
          <span>Receita recorrente mensal</span>
          <b>{formatarReais(f.receitaRecorrente)}</b>
          <small>
            {f.assinantes} {f.assinantes === 1 ? "assinatura ativa" : "assinaturas ativas"}
            {f.naoRenovam > 0 && ` (${f.naoRenovam} sem renovação)`}
            {f.inadimplentes > 0 && ` · ${f.inadimplentes} com pagamento pendente`} · {f.cancelados} encerradas
          </small>
        </div>
        <div className="kpi">
          <span>Jobs concluídos</span>
          <b>{j.concluidos}</b>
          <small>
            {j.criados} criados · {j.emAndamento} em andamento agora
          </small>
        </div>
        <div className="kpi">
          <span>Margem bruta estimada</span>
          <b>{pct(m.percentual)}</b>
          <small className={styles.meta} data-ok={acimaDaMeta}>
            {m.percentual === null ? "Sem jobs concluídos no período" : `${acimaDaMeta ? "✓ Acima" : "! Abaixo"} da meta de ${pct(m.alvo)}`}
          </small>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Faturamento nos últimos 12 meses</h2>
          <GraficoBarras
            rotuloAcessivel="Faturamento por mês nos últimos 12 meses"
            formatar={formatarReais}
            dados={f.meses.map((x) => {
              const [ano, mes] = x.mes.split("-").map(Number);
              return { rotulo: MESES[mes - 1], detalhe: `${MESES[mes - 1]}/${ano}`, valor: x.valor };
            })}
          />
          <details style={{ marginTop: 12 }}>
            <summary className="link small">Ver tabela</summary>
            <table className="extrato" style={{ marginTop: 8 }}>
              <tbody>
                {f.meses.map((x) => {
                  const [ano, mes] = x.mes.split("-").map(Number);
                  return (
                    <tr key={x.mes}>
                      <td>
                        {MESES[mes - 1]}/{ano}
                      </td>
                      <td className="num">{formatarReais(x.valor)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        </section>

        <section className="card">
          <h2>Margem dos jobs concluídos</h2>
          <table className="extrato">
            <tbody>
              <tr>
                <td>Receita dos jobs</td>
                <td className="num">{formatarReais(m.receita)}</td>
              </tr>
              <tr>
                <td>(−) Impostos e taxas ({pct(m.impostosPct)})</td>
                <td className="num">{formatarReais(m.impostos)}</td>
              </tr>
              <tr>
                <td>(−) Custo de produção (padrão)</td>
                <td className="num">{formatarReais(m.custo)}</td>
              </tr>
              <tr className={styles.total}>
                <td>Margem bruta</td>
                <td className="num">
                  {formatarReais(m.margem)} · {pct(m.percentual)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 10 }}>
            Receita = créditos dos jobs × valor médio do crédito ({formatarReais(c.valorCredito)}, tudo o que foi pago ÷
            créditos vendidos). Custo = horas padrão por tipo de peça (designer R$ {r.custos.valorHoraDesigner}/h, diretor R${" "}
            {r.custos.valorHoraDiretor}/h), adicionais e retrabalho, como definido na tela Preços.
          </p>
        </section>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="card">
          <h2>Créditos</h2>
          <dl className="dl">
            <dt>Vendidos no período</dt>
            <dd className="tnum">{c.vendidos} (pelos planos)</dd>
            <dt>Cortesias e ajustes</dt>
            <dd className="tnum">{c.cortesias}</dd>
            <dt>Consumidos em jobs</dt>
            <dd className="tnum">{c.consumidos}</dd>
            <dt>Devolvidos</dt>
            <dd className="tnum">{c.devolvidos}</dd>
            <dt>Expirados (não usados)</dt>
            <dd className="tnum">{c.expirados}</dd>
            <dt>Saldo em aberto hoje</dt>
            <dd className="tnum">
              {c.emAberto} créditos ≈ {formatarReais(c.emAberto * c.valorCredito)} já pagos e ainda não usados
            </dd>
          </dl>
        </section>

        <section className="card">
          <h2>Fluxo de jobs</h2>
          <dl className="dl">
            <dt>Criados</dt>
            <dd className="tnum">{j.criados}</dd>
            <dt>Concluídos</dt>
            <dd className="tnum">{j.concluidos}</dd>
            <dt>Cancelados</dt>
            <dd className="tnum">{j.cancelados}</dd>
            <dt>Entregues no prazo</dt>
            <dd className="tnum">{pct(j.noPrazo)}</dd>
            <dt>Ajustes por job</dt>
            <dd className="tnum">{num(j.mediaAjustes)} rodada(s) em média</dd>
            <dt>Aprovação de primeira</dt>
            <dd className="tnum">{pct(j.aprovacaoPrimeira)} (entre os aprovados pelo cliente)</dd>
          </dl>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Por tipo de peça (jobs concluídos)</h2>
        {j.porTipo.length === 0 ? (
          <p className="vazio">Nenhum job concluído no período.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="extrato">
              <thead>
                <tr>
                  <th>Peça</th>
                  <th className="num">Jobs</th>
                  <th className="num">Créditos</th>
                  <th className="num">Receita</th>
                  <th className="num">Custo</th>
                  <th className="num">Margem</th>
                </tr>
              </thead>
              <tbody>
                {j.porTipo.map((t) => (
                  <tr key={t.tipo}>
                    <td>{t.nome}</td>
                    <td className="num">{t.concluidos}</td>
                    <td className="num">{t.creditos}</td>
                    <td className="num">{formatarReais(t.receita)}</td>
                    <td className="num">{formatarReais(t.custo)}</td>
                    <td className="num">
                      {formatarReais(t.margem)} · {pct(t.receita ? t.margem / t.receita : null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Por designer (jobs concluídos)</h2>
        {j.porDesigner.length === 0 ? (
          <p className="vazio">Nenhum job concluído no período.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="extrato">
              <thead>
                <tr>
                  <th>Designer</th>
                  <th className="num">Jobs</th>
                  <th className="num">Reprovações internas</th>
                  <th className="num">Ajustes do cliente</th>
                  <th className="num">Custo padrão</th>
                </tr>
              </thead>
              <tbody>
                {j.porDesigner.map((d) => (
                  <tr key={d.nome}>
                    <td>{d.nome}</td>
                    <td className="num">{d.concluidos}</td>
                    <td className="num">{d.reprovacoesInternas}</td>
                    <td className="num">{d.ajustesCliente}</td>
                    <td className="num">{formatarReais(d.custo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="hint" style={{ marginTop: 16 }}>
        Custos são estimativas pelas premissas da tela Preços (seção Custos de produção), não horas reais. Pagamentos são
        simulados enquanto o gateway real não estiver ligado.
      </p>
    </>
  );
}
