import type { Metadata } from "next";
import Link from "next/link";
import { formatarReais } from "@/domain/catalogo";
import { exigirUsuario } from "@/server/auth";
import { clientesFinanceiro } from "@/server/services/clientesFinanceiro";
import { type CodigoPeriodo, PERIODOS } from "@/server/services/relatorios";
import { Etiquetas, pct } from "./Etiquetas";

export const metadata: Metadata = { title: "Usuários" };

// Análise > Usuários: o que cada cliente contrata, como usa os créditos e quanto deixa de resultado.
export default async function ClientesFinanceiro({ searchParams }: PageProps<"/equipe/clientes">) {
  await exigirUsuario(["admin"]);
  const { p } = await searchParams;
  const periodo: CodigoPeriodo = PERIODOS.some((x) => x.id === p) ? (p as CodigoPeriodo) : "90d";
  const lista = clientesFinanceiro(periodo);
  const total = (f: (c: (typeof lista)[number]) => number) => lista.reduce((s, c) => s + f(c), 0);
  const receita = total((c) => c.receita);
  const resultado = total((c) => c.resultado);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Usuários</h1>
          <p>O que cada cliente contrata, onde gasta os créditos, o perfil de uso e o resultado estimado.</p>
        </div>
      </div>

      <nav className="chips" aria-label="Período" style={{ marginBottom: 16 }}>
        {PERIODOS.map((x) => (
          <Link key={x.id} href={`/equipe/clientes?p=${x.id}`} className="chip" aria-current={periodo === x.id ? "page" : undefined}>
            {x.rotulo}
          </Link>
        ))}
      </nav>

      <div className="grid-kpi" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <span>Receita no período</span>
          <b>{formatarReais(receita)}</b>
          <small className="muted">{lista.length} clientes</small>
        </div>
        <div className="kpi">
          <span>Resultado estimado</span>
          <b style={{ color: resultado < 0 ? "var(--danger)" : undefined }}>{formatarReais(resultado)}</b>
          <small className="muted">{receita > 0 ? pct((resultado / receita) * 100) : "—"} da receita</small>
        </div>
        <div className="kpi">
          <span>Créditos usados</span>
          <b>{total((c) => c.creditosUsados).toLocaleString("pt-BR")}</b>
          <small className="muted">de {total((c) => c.creditosRecebidos).toLocaleString("pt-BR")} recebidos dos planos</small>
        </div>
        <div className="kpi">
          <span>Créditos expirados</span>
          <b>{total((c) => c.creditosExpirados).toLocaleString("pt-BR")}</b>
          <small className="muted">receita sem custo</small>
        </div>
      </div>

      <section className="card" style={{ overflowX: "auto" }}>
        <h2>Do mais lucrativo para o menos</h2>
        {lista.length === 0 ? (
          <p className="muted small">Nenhum cliente com atividade neste período.</p>
        ) : (
          <table className="extrato">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Plano</th>
                <th className="num">Receita</th>
                <th className="num">Créditos usados</th>
                <th className="num">Pedidos</th>
                <th>Peça mais pedida</th>
                <th className="num">Ajustes por pedido</th>
                <th className="num">Resultado</th>
                <th>Perfil</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/equipe/clientes/${c.id}?p=${periodo}`}>{c.nome}</Link>
                    {c.empresa && <small className="muted"> · {c.empresa}</small>}
                    {!c.ativo && <small className="muted"> · desativado</small>}
                  </td>
                  <td className="small">{c.plano ?? "—"}</td>
                  <td className="num">{formatarReais(c.receita)}</td>
                  <td className="num">
                    {c.creditosUsados}
                    {c.creditosRecebidos > 0 && <small className="muted"> / {c.creditosRecebidos}</small>}
                  </td>
                  <td className="num">{c.pedidos}</td>
                  <td className="small">{c.pecaPreferida ?? "—"}</td>
                  <td className="num">{c.ajustesPorPedido === null ? "—" : c.ajustesPorPedido.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                  <td className="num">
                    <b style={{ color: c.resultado < 0 ? "var(--danger)" : undefined }}>{formatarReais(c.resultado)}</b>
                    <br />
                    <small className="muted">{pct(c.margemPct)}</small>
                  </td>
                  <td style={{ minWidth: 200 }}>
                    <Etiquetas perfil={c.perfil} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small" style={{ marginTop: 12 }}>
          Resultado = receita paga no período − impostos − custo estimado (horas previstas da tela Preços + repasses + rodadas que
          aconteceram) dos pedidos concluídos no período. Créditos que expiram sem uso entram como receita sem custo.
        </p>
      </section>
    </>
  );
}
