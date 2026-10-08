import type { Metadata } from "next";
import Link from "next/link";
import { planoPorId } from "@/domain/precos";
import { precos } from "@/server/services/precos";
import { ListaPedidos } from "@/components/app/ListaPedidos";
import { Notificacoes } from "@/components/app/Notificacoes";
import { exigirUsuario } from "@/server/auth";
import { formatarData } from "@/server/datas";
import { assinaturaDo } from "@/server/services/assinaturas";
import { saldo } from "@/server/services/creditos";
import { listarNotificacoes } from "@/server/services/notificacoes";
import { listarPedidosCliente } from "@/server/services/pedidos";

export const metadata: Metadata = { title: "Início" };

export default async function PainelCliente({ searchParams }: PageProps<"/cliente">) {
  const u = await exigirUsuario(["cliente"]);
  const { bemvindo } = await searchParams;
  const pedidos = listarPedidosCliente(u.id);
  const aRevisar = pedidos.filter((p) => p.status === "revisao_cliente");
  const andamento = pedidos.filter((p) => !["aprovado", "cancelado", "revisao_cliente"].includes(p.status));
  const assinatura = assinaturaDo(u.id);
  const plano = planoPorId(precos(), assinatura?.plano_id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Olá, {u.nome.split(" ")[0]}</h1>
          <p>{u.empresa ? `Painel da ${u.empresa}` : "Seu painel de pedidos"}</p>
        </div>
        <Link href="/cliente/pedidos/novo" className="btn btn-primary">
          Novo pedido
        </Link>
      </div>

      {bemvindo && (
        <p className="alerta alerta-ok" style={{ marginBottom: 16 }}>
          Conta criada e assinatura ativa. Seus créditos já estão disponíveis.
        </p>
      )}

      <div className="grid-kpi" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <span>Saldo</span>
          <b>{saldo(u.id)}</b>
          <small>créditos</small>
        </div>
        <div className="kpi">
          <span>Para revisar</span>
          <b>{aRevisar.length}</b>
          <small>{aRevisar.length === 1 ? "peça" : "peças"}</small>
        </div>
        <div className="kpi">
          <span>Em andamento</span>
          <b>{andamento.length}</b>
          <small>pedidos</small>
        </div>
        <div className="kpi">
          <span>Plano</span>
          <b style={{ fontSize: 22 }}>{plano?.nome ?? "Nenhum"}</b>
          <small>
            {assinatura?.status === "ativa" ? `Renova em ${formatarData(assinatura.periodo_fim)}` : "Assinatura inativa"}
          </small>
        </div>
      </div>

      <div className="grid-2">
        <div>
          {aRevisar.length > 0 && (
            <section className="card" style={{ borderColor: "var(--key)", marginBottom: 16 }}>
              <h2 className="card-title">Esperando sua revisão</h2>
              <ListaPedidos pedidos={aRevisar} visao="cliente" />
            </section>
          )}
          <section className="card">
            <div className="row-between" style={{ marginBottom: 6 }}>
              <h2 className="card-title" style={{ margin: 0 }}>
                Em andamento
              </h2>
              <Link href="/cliente/pedidos" className="link small">
                Ver todos
              </Link>
            </div>
            <ListaPedidos pedidos={andamento} visao="cliente" vazio="Nenhum pedido em produção agora." />
          </section>
        </div>
        <Notificacoes itens={listarNotificacoes(u.id, 8)} />
      </div>
    </>
  );
}
