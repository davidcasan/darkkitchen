import type { Metadata } from "next";
import Link from "next/link";
import { ListaPedidos } from "@/components/app/ListaPedidos";
import { EQUIPE, STATUS, type StatusPedido } from "@/domain/pedido";
import { exigirUsuario } from "@/server/auth";
import { listarPedidosEquipe } from "@/server/services/pedidos";

export const metadata: Metadata = { title: "Pedidos" };

const ORDEM: StatusPedido[] = ["triagem", "producao", "qualidade", "revisao_cliente", "ajustes", "aprovado", "cancelado"];

export default async function PedidosEquipe({ searchParams }: PageProps<"/equipe/pedidos">) {
  const u = await exigirUsuario(EQUIPE);
  const sp = await searchParams;
  const status = ORDEM.includes(sp.status as StatusPedido) ? (sp.status as StatusPedido) : null;
  const meus = sp.meus === "1" && u.papel === "designer";
  const pedidos = listarPedidosEquipe({
    status: status ? [status] : ORDEM.filter((s) => !["aprovado", "cancelado"].includes(s)),
    designerId: meus ? u.id : undefined,
  });

  const link = (s: StatusPedido | null, m = meus) => {
    const q = new URLSearchParams();
    if (s) q.set("status", s);
    if (m) q.set("meus", "1");
    const t = q.toString();
    return `/equipe/pedidos${t ? `?${t}` : ""}`;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pedidos</h1>
          <p>
            {pedidos.length} {status ? `em "${STATUS[status].rotulo}"` : "ativos"}
            {meus ? " atribuídos a você" : ""}. Urgentes e com prazo mais próximo aparecem primeiro.
          </p>
        </div>
      </div>
      <nav className="chips" aria-label="Filtrar por status" style={{ marginBottom: 10 }}>
        <Link href={link(null)} className="chip" aria-current={!status ? "page" : undefined}>
          Ativos
        </Link>
        {ORDEM.map((s) => (
          <Link key={s} href={link(s)} className="chip" aria-current={status === s ? "page" : undefined}>
            {STATUS[s].rotulo}
          </Link>
        ))}
      </nav>
      {u.papel === "designer" && (
        <p style={{ marginBottom: 14 }}>
          <Link href={link(status, !meus)} className="chip" aria-current={meus ? "page" : undefined}>
            Só os meus
          </Link>
        </p>
      )}
      <section className="card">
        <ListaPedidos pedidos={pedidos} visao="equipe" />
      </section>
    </>
  );
}
