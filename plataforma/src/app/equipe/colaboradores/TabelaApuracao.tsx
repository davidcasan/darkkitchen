import Link from "next/link";
import { PECAS } from "@/domain/catalogo";
import { formatarReais } from "@/domain/catalogo";
import type { ApuracaoColaborador } from "@/server/services/colaboradores";

// Detalhe da apuração de um colaborador no mês (usado pelo admin e em "Meus ganhos").

export const horas = (h: number) => `${h.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h`;
export const dataCurta = (s: string) => {
  const [a, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};
export const situacaoDe = (a: ApuracaoColaborador) =>
  !a.fechamento ? "Em aberto" : a.fechamento.pago_em ? `Pago em ${dataCurta(a.fechamento.pago_em)}` : "Fechado, a pagar";

const nomePeca = (id: string) => PECAS.find((p) => p.id === id)?.nome ?? id;

export function TabelaApuracao({ a, linkEquipe = true }: { a: ApuracaoColaborador; linkEquipe?: boolean }) {
  if (!a.linhas.length)
    return (
      <p className="muted small">
        {a.ficha.forma === "mensal" ? `Valor fixo mensal: ${formatarReais(a.valor)}. ` : ""}Nenhum pedido aprovado neste mês.
      </p>
    );
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="extrato">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Peça</th>
            <th>Função</th>
            <th>Situação</th>
            <th className="num">Rodadas</th>
            <th className="num">Horas previstas</th>
            <th className="num">Valor</th>
          </tr>
        </thead>
        <tbody>
          {a.linhas.map((l) => (
            <tr key={`${l.pedidoId}-${l.papel}`}>
              <td>
                {linkEquipe ? <Link href={`/equipe/pedidos/${l.pedidoId}`}>{l.codigo}</Link> : l.codigo}{" "}
                <small className="muted">{l.titulo}</small>
              </td>
              <td className="small">
                {nomePeca(l.tipo)}
                {l.duracao ? ` ${l.duracao}s` : ""}
              </td>
              <td className="small">{l.papel === "designer" ? "Produção" : "Direção de arte"}</td>
              <td className="small">
                {l.situacao === "aprovado" ? "Aprovado" : "Cancelado"} em {dataCurta(l.data)}
              </td>
              <td className="num small" title="Ajustes do cliente + reprovações internas">
                {l.rodadasCliente}
                {l.reprovacoesInternas ? ` + ${l.reprovacoesInternas}` : ""}
              </td>
              <td className="num">{horas(l.horas)}</td>
              <td className="num">{a.ficha.forma === "mensal" || a.ficha.forma === "nenhum" ? "—" : formatarReais(l.valor)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>
              <b>Total</b>
              {a.ficha.forma === "mensal" && <small className="muted"> (valor fixo mensal)</small>}
              {a.ficha.forma === "nenhum" && <small className="muted"> (sem pagamento: só custo)</small>}
            </td>
            <td className="num">
              <b>{horas(a.horasDesigner + a.horasDiretor)}</b>
            </td>
            <td className="num">
              <b>{formatarReais(a.valor)}</b>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
