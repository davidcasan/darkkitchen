import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GraficoBarras } from "@/components/app/GraficoBarras";
import { StatusBadge } from "@/components/app/Status";
import { formatarReais } from "@/domain/catalogo";
import type { StatusPedido } from "@/domain/pedido";
import { exigirUsuario } from "@/server/auth";
import { formatarData } from "@/server/datas";
import { detalheClienteFinanceiro } from "@/server/services/clientesFinanceiro";
import { type CodigoPeriodo, PERIODOS } from "@/server/services/relatorios";
import { Etiquetas, pct } from "../Etiquetas";

export const metadata: Metadata = { title: "Perfil financeiro do cliente" };

const nomeMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });
};

export default async function PerfilFinanceiroCliente({ params, searchParams }: PageProps<"/equipe/clientes/[id]">) {
  await exigirUsuario(["admin"]);
  const { id } = await params;
  const { p } = await searchParams;
  const periodo: CodigoPeriodo = PERIODOS.some((x) => x.id === p) ? (p as CodigoPeriodo) : "90d";
  const c = detalheClienteFinanceiro(Number(id), periodo);
  if (!c) notFound();
  const totalGasto = c.gastos.reduce((s, g) => s + g.creditos, 0);
  const cor = (v: number) => (v < 0 ? "var(--danger)" : undefined);

  return (
    <>
      <Link href={`/equipe/clientes?p=${periodo}`} className="small">
        ← Clientes
      </Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <h1>{c.nome}</h1>
          <p className="muted">
            {c.empresa ? `${c.empresa} · ` : ""}
            {c.email} · plano {c.plano ?? "nenhum"} · saldo {c.saldo} créditos · crédito médio pago {formatarReais(c.valorCredito)}
          </p>
          <div style={{ marginTop: 8 }}>
            <Etiquetas perfil={c.perfil} />
          </div>
        </div>
        <Link href={`/equipe/contas/${c.id}`} className="btn">
          Conta do cliente
        </Link>
      </div>

      <nav className="chips" aria-label="Período" style={{ marginBottom: 16 }}>
        {PERIODOS.map((x) => (
          <Link key={x.id} href={`/equipe/clientes/${c.id}?p=${x.id}`} className="chip" aria-current={periodo === x.id ? "page" : undefined}>
            {x.rotulo}
          </Link>
        ))}
      </nav>

      <div className="grid-kpi" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <span>Receita paga</span>
          <b>{formatarReais(c.receita)}</b>
          <small className="muted">impostos {formatarReais(c.impostos)}</small>
        </div>
        <div className="kpi">
          <span>Custo estimado</span>
          <b>{formatarReais(c.custo)}</b>
          <small className="muted">{c.concluidos} pedidos concluídos</small>
        </div>
        <div className="kpi">
          <span>Resultado</span>
          <b style={{ color: cor(c.resultado) }}>{formatarReais(c.resultado)}</b>
          <small className="muted">{pct(c.margemPct)} da receita</small>
        </div>
        <div className="kpi">
          <span>Créditos</span>
          <b>
            {c.creditosUsados} <small className="muted">usados</small>
          </b>
          <small className="muted">
            {c.creditosRecebidos} do plano
            {c.creditosBonus > 0 && ` · ${c.creditosBonus} bônus`}
            {c.creditosDevolvidos > 0 && ` · ${c.creditosDevolvidos} devolvidos`}
            {c.creditosExpirados > 0 && ` · ${c.creditosExpirados} expirados`}
          </small>
        </div>
      </div>

      <div className="grid-kpi" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <span>Pedidos</span>
          <b>{c.pedidos}</b>
          <small className="muted">{c.cancelados > 0 ? `${c.cancelados} cancelados` : "nenhum cancelado"}</small>
        </div>
        <div className="kpi">
          <span>Ajustes por pedido</span>
          <b>{c.ajustesPorPedido === null ? "—" : c.ajustesPorPedido.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</b>
          <small className="muted">aprovação de primeira {pct(c.primeiraPct)}</small>
        </div>
        <div className="kpi">
          <span>Pedidos urgentes</span>
          <b>{pct(c.urgentesPct)}</b>
        </div>
        <div className="kpi">
          <span>Rejeições totais</span>
          <b>{c.rejeicoes}</b>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <section className="card" style={{ overflowX: "auto" }}>
          <h2>Onde gasta os créditos</h2>
          {c.gastos.length === 0 ? (
            <p className="muted small">Nenhum pedido no período.</p>
          ) : (
            <table className="extrato">
              <tbody>
                {c.gastos.map((g) => (
                  <tr key={g.categoria}>
                    <td>{g.categoria}</td>
                    <td className="num">{g.creditos} cr</td>
                    <td className="num muted">{pct(totalGasto ? (g.creditos / totalGasto) * 100 : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card" style={{ overflowX: "auto" }}>
          <h2>Tipos de peça</h2>
          {c.porTipo.length === 0 ? (
            <p className="muted small">Nenhum pedido no período.</p>
          ) : (
            <table className="extrato">
              <thead>
                <tr>
                  <th>Peça</th>
                  <th className="num">Pedidos</th>
                  <th className="num">Créditos</th>
                  <th className="num">Margem (concluídos)</th>
                </tr>
              </thead>
              <tbody>
                {c.porTipo.map((t) => (
                  <tr key={t.tipo}>
                    <td>{t.nome}</td>
                    <td className="num">{t.pedidos}</td>
                    <td className="num">{t.creditos}</td>
                    <td className="num" style={{ color: cor(t.margem) }}>
                      {t.custo ? formatarReais(t.margem) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Receita paga nos últimos 12 meses</h2>
        <GraficoBarras
          dados={c.meses.map((m) => ({ rotulo: nomeMes(m.mes), detalhe: nomeMes(m.mes), valor: m.receita }))}
          formatar={formatarReais}
          rotuloAcessivel={`Receita paga por mês de ${c.nome}`}
        />
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="extrato">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="num">Receita</th>
                <th className="num">Custo estimado</th>
                <th className="num">Receita − custo</th>
              </tr>
            </thead>
            <tbody>
              {c.meses
                .filter((m) => m.receita || m.custo)
                .map((m) => (
                  <tr key={m.mes}>
                    <td>{nomeMes(m.mes)}</td>
                    <td className="num">{formatarReais(m.receita)}</td>
                    <td className="num">{formatarReais(m.custo)}</td>
                    <td className="num" style={{ color: cor(m.receita - m.custo) }}>
                      {formatarReais(m.receita - m.custo)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ overflowX: "auto" }}>
        <h2>Pedidos do período</h2>
        {c.lista.length === 0 ? (
          <p className="muted small">Nenhum pedido neste período.</p>
        ) : (
          <table className="extrato">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Situação</th>
                <th>Feito em</th>
                <th className="num">Créditos</th>
                <th className="num">Ajustes</th>
                <th className="num">Custo</th>
                <th className="num">Margem</th>
              </tr>
            </thead>
            <tbody>
              {c.lista.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/equipe/pedidos/${l.id}`}>{l.codigo}</Link> <small className="muted">{l.titulo}</small>
                    {l.urgente && (
                      <small className="badge" data-tom="andamento" style={{ marginLeft: 6 }}>
                        urgente
                      </small>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={l.status as StatusPedido} visao="equipe" />
                  </td>
                  <td className="small">{formatarData(l.criado_em)}</td>
                  <td className="num">{l.creditos}</td>
                  <td className="num small">
                    {l.rodadas}
                    {l.reprovacoes ? ` + ${l.reprovacoes} internas` : ""}
                  </td>
                  <td className="num">{l.custo === null ? "—" : formatarReais(l.custo)}</td>
                  <td className="num" style={{ color: l.margem === null ? undefined : cor(l.margem) }}>
                    {l.margem === null ? "—" : formatarReais(l.margem)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small" style={{ marginTop: 12 }}>
          Margem do pedido = créditos (com rodadas extras) × crédito médio pago pelo cliente − impostos − custo estimado. Só para pedidos
          concluídos.
        </p>
      </section>
    </>
  );
}
