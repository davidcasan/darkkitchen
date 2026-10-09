import Link from "next/link";
import { pecaDo } from "@/domain/briefing";
import type { TipoPeca } from "@/domain/catalogo";
import { LIMITE_TENTATIVAS } from "@/domain/pedido";
import { formatarData } from "@/server/datas";
import type { PedidoResumo } from "@/server/services/pedidos";
import { StatusBadge } from "./Status";

export function ListaPedidos({
  pedidos,
  visao,
  vazio = "Nenhum pedido por aqui.",
}: {
  pedidos: PedidoResumo[];
  visao: "cliente" | "equipe";
  vazio?: string;
}) {
  if (!pedidos.length) return <p className="vazio">{vazio}</p>;
  const base = visao === "cliente" ? "/cliente/pedidos" : "/equipe/pedidos";
  return (
    <ul className="lista">
      {pedidos.map((p) => (
        <li key={p.id}>
          <Link href={`${base}/${p.id}`} className="item-pedido">
            <span className="item-titulo">{p.titulo}</span>
            <StatusBadge status={p.status} visao={visao} />
            <span className="item-meta">
              <span className="tnum">{p.codigo}</span>
              <span>{pecaDo({ tipo: p.tipo as TipoPeca })?.nome}</span>
              {visao === "equipe" && (
                <span>
                  Solicitante: {p.cliente_nome}
                  {p.empresa && ` (${p.empresa})`}
                </span>
              )}
              {p.marca_nome && (visao === "cliente" || p.marca_nome !== p.empresa) && <span>Marca: {p.marca_nome}</span>}
              {visao === "equipe" && <span>{p.designer_nome ? `Designer: ${p.designer_nome}` : "Sem designer"}</span>}
              {!["aprovado", "cancelado"].includes(p.status) && <span>Entrega prevista {formatarData(p.entrega_prevista)}</span>}
              {p.urgente === 1 && <span className="tag">Urgente</span>}
              {visao === "equipe" && p.tentativas_internas >= LIMITE_TENTATIVAS && p.status !== "aprovado" && (
                <span className="tag">{p.tentativas_internas} reprovações internas</span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
