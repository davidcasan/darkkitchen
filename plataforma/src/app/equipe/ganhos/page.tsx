import type { Metadata } from "next";
import Link from "next/link";
import { formatarReais } from "@/domain/catalogo";
import { EQUIPE } from "@/domain/pedido";
import { exigirUsuario } from "@/server/auth";
import { FORMAS, apuracaoDe, mesAtual, mesValido, mesVizinho, nomeDoMes } from "@/server/services/colaboradores";
import { TabelaApuracao, horas, situacaoDe } from "../colaboradores/TabelaApuracao";

export const metadata: Metadata = { title: "Meus ganhos" };

// Meus ganhos: o colaborador vê só a própria apuração do mês (horas previstas, pedidos, valor e pagamento).
export default async function MeusGanhos({ searchParams }: PageProps<"/equipe/ganhos">) {
  const u = await exigirUsuario(EQUIPE);
  const { mes: mesParam } = await searchParams;
  const mes = mesValido(typeof mesParam === "string" ? mesParam : null) ?? mesAtual();
  const a = apuracaoDe(u.id, mes);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Meus ganhos</h1>
          <p>Seus pedidos aprovados no mês, em horas previstas, e o valor a receber.</p>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 16 }}>
        <Link className="btn btn-sm" href={`/equipe/ganhos?mes=${mesVizinho(mes, -1)}`} aria-label="Mês anterior">
          ‹
        </Link>
        <b style={{ minWidth: 170, textAlign: "center" }}>{nomeDoMes(mes)}</b>
        {mes < mesAtual() ? (
          <Link className="btn btn-sm" href={`/equipe/ganhos?mes=${mesVizinho(mes, 1)}`} aria-label="Próximo mês">
            ›
          </Link>
        ) : (
          <span className="btn btn-sm" aria-hidden="true" style={{ opacity: 0.35 }}>
            ›
          </span>
        )}
      </div>

      {!a ? (
        <p className="muted">Nada neste mês.</p>
      ) : (
        <>
          <div className="grid-kpi" style={{ marginBottom: 16 }}>
            <div className="kpi">
              <span>A receber</span>
              <b>{formatarReais(a.valor)}</b>
              <small className="muted">{FORMAS[a.ficha.forma]}</small>
            </div>
            <div className="kpi">
              <span>Horas previstas</span>
              <b>{horas(a.horasDesigner + a.horasDiretor)}</b>
            </div>
            <div className="kpi">
              <span>Pedidos</span>
              <b>{new Set(a.linhas.map((l) => l.pedidoId)).size}</b>
            </div>
            <div className="kpi">
              <span>Situação</span>
              <b style={{ fontSize: 18 }}>{situacaoDe(a)}</b>
            </div>
          </div>
          <section className="card">
            <TabelaApuracao a={a} />
            <p className="muted small" style={{ marginTop: 12 }}>
              Horas previstas pela tabela do estúdio para cada tipo de peça, mais o retrabalho das rodadas de ajuste. Os valores ficam
              definitivos quando o mês é fechado. Dúvidas: fale com a administração.
            </p>
          </section>
        </>
      )}
    </>
  );
}
