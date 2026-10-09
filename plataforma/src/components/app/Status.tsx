import { STATUS, type StatusPedido } from "@/domain/pedido";

export function StatusBadge({ status, visao }: { status: StatusPedido; visao: "cliente" | "equipe" }) {
  const s = STATUS[status];
  return (
    <span className="badge" data-tom={s.tom}>
      {visao === "cliente" ? s.cliente : s.rotulo}
    </span>
  );
}
