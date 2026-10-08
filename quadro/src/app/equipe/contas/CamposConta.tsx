"use client";

import { useState } from "react";
import { type Papel, PAPEIS } from "@/domain/pedido";

/** Campos de uma conta. Empresa só aparece para cliente; "sênior" só para designer. */
export function CamposConta({
  inicial,
  papeisPermitidos = Object.keys(PAPEIS) as Papel[],
}: {
  inicial?: { nome: string; email: string; papel: Papel; empresa: string | null; senior: number };
  papeisPermitidos?: Papel[];
}) {
  const [papel, setPapel] = useState<Papel>(inicial?.papel ?? "cliente");
  return (
    <>
      <div className="field">
        <label className="label" htmlFor="c-papel">
          Tipo de conta
        </label>
        <select id="c-papel" name="papel" className="txt" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
          {papeisPermitidos.map((p) => (
            <option key={p} value={p}>
              {PAPEIS[p]}
            </option>
          ))}
        </select>
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: "1 1 220px" }}>
          <label className="label" htmlFor="c-nome">
            Nome
          </label>
          <input id="c-nome" name="nome" className="txt" defaultValue={inicial?.nome} required />
        </div>
        <div className="field" style={{ flex: "1 1 220px" }}>
          <label className="label" htmlFor="c-email">
            E-mail
          </label>
          <input id="c-email" name="email" type="email" className="txt" defaultValue={inicial?.email} required />
        </div>
      </div>
      {papel === "cliente" && (
        <div className="field">
          <label className="label" htmlFor="c-empresa">
            Empresa ou marca
          </label>
          <input id="c-empresa" name="empresa" className="txt" defaultValue={inicial?.empresa ?? ""} />
        </div>
      )}
      {papel === "designer" && (
        <label className="check" style={{ marginBottom: 18 }}>
          <input type="checkbox" name="senior" value="1" defaultChecked={inicial?.senior === 1} />
          <span>
            <b>Designer sênior</b>
            <br />
            <span className="opt">Indicado para pedidos que já foram reprovados internamente.</span>
          </span>
        </label>
      )}
    </>
  );
}
