import type { Metadata } from "next";
import Link from "next/link";
import { ListaPedidos } from "@/components/app/ListaPedidos";
import { Notificacoes } from "@/components/app/Notificacoes";
import { EQUIPE, LIMITE_TENTATIVAS, PAPEIS, STATUS, type StatusPedido } from "@/domain/pedido";
import { exigirUsuario, type Usuario } from "@/server/auth";
import { listarNotificacoes } from "@/server/services/notificacoes";
import { contarPorStatus, listarPedidosEquipe, metricas, type PedidoResumo } from "@/server/services/pedidos";

export const metadata: Metadata = { title: "Painel da equipe" };

interface Fila {
  titulo: string;
  pedidos: PedidoResumo[];
  vazio: string;
}

/** As filas mudam conforme o papel: cada um vê primeiro o que depende dele. */
function filasDo(u: Usuario): Fila[] {
  if (u.papel === "designer")
    return [
      {
        titulo: "Sua fila de produção",
        pedidos: listarPedidosEquipe({ designerId: u.id, status: ["producao", "ajustes"] }),
        vazio: "Nada para produzir agora.",
      },
    ];
  // Diretor de arte (e admin): triagem/atribuição e controle de qualidade. O admin também
  // produz como designer sênior, então vê primeiro a própria fila de produção.
  return [
    ...(u.papel === "admin"
      ? [
          {
            titulo: "Sua fila de produção",
            pedidos: listarPedidosEquipe({ designerId: u.id, status: ["producao", "ajustes"] }),
            vazio: "Nenhum pedido atribuído a você para produzir.",
          },
        ]
      : []),
    {
      titulo: "Aguardando controle de qualidade",
      pedidos: listarPedidosEquipe({ status: ["qualidade"] }),
      vazio: "Nenhuma versão aguardando revisão.",
    },
    {
      titulo: "Triagem",
      pedidos: listarPedidosEquipe({ status: ["triagem"] }),
      vazio: "Nenhum pedido aguardando triagem.",
    },
  ];
}

export default async function PainelEquipe() {
  const u = await exigirUsuario(EQUIPE);
  const filas = filasDo(u);
  const contagem = contarPorStatus();
  const m = metricas();
  const escalar = u.papel !== "designer"
    ? listarPedidosEquipe({ status: ["producao", "ajustes", "qualidade"] }).filter((p) => p.tentativas_internas >= LIMITE_TENTATIVAS)
    : [];
  const meusEmAndamento =
    u.papel === "designer" || u.papel === "admin"
      ? listarPedidosEquipe({ designerId: u.id, status: ["qualidade", "revisao_cliente"] })
      : [];

  const ativos: StatusPedido[] = ["triagem", "producao", "qualidade", "revisao_cliente", "ajustes"];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Olá, {u.nome.split(" ")[0]}</h1>
          <p>{PAPEIS[u.papel]}</p>
        </div>
        <Link href="/equipe/pedidos" className="btn">
          Todos os pedidos
        </Link>
      </div>

      <div className="grid-kpi" style={{ marginBottom: 16 }}>
        {ativos.map((s) => (
          <Link key={s} href={`/equipe/pedidos?status=${s}`} className="kpi" style={{ textDecoration: "none" }}>
            <span>{STATUS[s].rotulo}</span>
            <b>{contagem[s]}</b>
          </Link>
        ))}
      </div>

      <div className="grid-2">
        <div>
          {escalar.length > 0 && (
            <section className="card" style={{ borderColor: "var(--danger)", marginBottom: 16 }}>
              <h2 className="card-title">Precisam de um designer mais sênior</h2>
              <ListaPedidos pedidos={escalar} visao="equipe" />
            </section>
          )}
          {filas.map((fila) => (
            <section className="card" key={fila.titulo}>
              <h2 className="card-title">{fila.titulo}</h2>
              <ListaPedidos pedidos={fila.pedidos} visao="equipe" vazio={fila.vazio} />
            </section>
          ))}
          {meusEmAndamento.length > 0 && (
            <section className="card">
              <h2 className="card-title">Suas peças em revisão</h2>
              <ListaPedidos pedidos={meusEmAndamento} visao="equipe" />
            </section>
          )}
        </div>
        <div>
          <section className="card" style={{ marginBottom: 16 }}>
            <h2 className="card-title">Aprovação de primeira</h2>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 700, lineHeight: 1.1 }}>
              {m.taxaPrimeira === null ? "—" : `${m.taxaPrimeira}%`}
            </p>
            <p className="muted small">
              Peças aprovadas pelo cliente sem nenhum ajuste nem reprovação interna, entre {m.aprovados} aprovadas pelo cliente. É a métrica principal da
              operação.
            </p>
            {m.motivos.length > 0 && (
              <>
                <h3 style={{ fontSize: 15, margin: "16px 0 8px" }}>Motivos de reprovação mais comuns</h3>
                <table className="extrato">
                  <tbody>
                    {m.motivos.map((x) => (
                      <tr key={x.origem + x.motivo}>
                        <td>
                          {x.motivo}
                          <br />
                          <small className="muted">{x.origem}</small>
                        </td>
                        <td className="num">{x.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
          <Notificacoes itens={listarNotificacoes(u.id, 8)} />
        </div>
      </div>
    </>
  );
}
