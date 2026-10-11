import type { Etiqueta } from "@/server/services/clientesFinanceiro";

// Etiquetas do perfil financeiro do cliente (Financeiro > Clientes).

export const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

export function Etiquetas({ perfil }: { perfil: Etiqueta[] }) {
  if (!perfil.length) return <span className="muted small">—</span>;
  return (
    <span className="row" style={{ flexWrap: "wrap", gap: 4 }}>
      {perfil.map((e) => (
        <span key={e.rotulo} className="badge" data-tom={e.tom} style={{ fontSize: 12 }}>
          {e.rotulo}
        </span>
      ))}
    </span>
  );
}
