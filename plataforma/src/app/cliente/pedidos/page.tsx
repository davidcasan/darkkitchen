import type { Metadata } from "next";
import Link from "next/link";
import { ListaPedidos } from "@/components/app/ListaPedidos";
import { exigirUsuario } from "@/server/auth";
import { listarPedidosCliente } from "@/server/services/pedidos";

export const metadata: Metadata = { title: "Pedidos" };

const FILTROS = [
  { id: "todos", rotulo: "Todos" },
  { id: "andamento", rotulo: "Em andamento" },
  { id: "revisar", rotulo: "Para revisar" },
  { id: "concluidos", rotulo: "Concluídos" },
] as const;

export default async function PedidosCliente({ searchParams }: PageProps<"/cliente/pedidos">) {
  const u = await exigirUsuario(["cliente"]);
  const { f } = await searchParams;
  const filtro = FILTROS.find((x) => x.id === f)?.id ?? "todos";
  const todos = listarPedidosCliente(u.id);
  const pedidos = todos.filter((p) => {
    if (filtro === "andamento") return ["triagem", "producao", "qualidade", "ajustes"].includes(p.status);
    if (filtro === "revisar") return p.status === "revisao_cliente";
    if (filtro === "concluidos") return ["aprovado", "cancelado"].includes(p.status);
    return true;
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pedidos</h1>
          <p>{todos.length} pedidos no total</p>
        </div>
        <Link href="/cliente/pedidos/novo" className="btn btn-primary">
          Novo pedido
        </Link>
      </div>
      <nav className="chips" aria-label="Filtrar pedidos" style={{ marginBottom: 14 }}>
        {FILTROS.map((x) => (
          <Link
            key={x.id}
            href={x.id === "todos" ? "/cliente/pedidos" : `/cliente/pedidos?f=${x.id}`}
            className="chip"
            aria-current={filtro === x.id ? "page" : undefined}
          >
            {x.rotulo}
          </Link>
        ))}
      </nav>
      <section className="card">
        <ListaPedidos pedidos={pedidos} visao="cliente" />
      </section>
    </>
  );
}
