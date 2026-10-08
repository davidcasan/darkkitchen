import type { Metadata } from "next";
import Link from "next/link";
import { comprarCreditosAction } from "@/app/actions/cliente";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { PACOTES_AVULSOS, PRECO_CREDITO_AVULSO, formatarReais } from "@/domain/catalogo";
import { exigirUsuario } from "@/server/auth";
import { formatarData } from "@/server/datas";
import { extrato, saldo } from "@/server/services/creditos";
import { gatewayEhSimulado, listarMetodos } from "@/server/services/pagamentos";

export const metadata: Metadata = { title: "Créditos" };

const TIPOS: Record<string, string> = {
  assinatura: "Plano",
  compra: "Compra",
  pedido: "Pedido",
  revisao_extra: "Revisão extra",
  estorno: "Devolução",
  ajuste: "Ajuste",
};

export default async function CreditosCliente() {
  const u = await exigirUsuario(["cliente"]);
  const lancamentos = extrato(u.id);
  const metodos = listarMetodos(u.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Créditos</h1>
          <p>Cada peça custa uma quantidade fixa de créditos. Você vê o total antes de enviar o pedido.</p>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <span className="muted small">Saldo disponível</span>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 700, lineHeight: 1.1 }} className="tnum">
            {saldo(u.id)} <span style={{ fontSize: 18, color: "var(--muted)" }}>créditos</span>
          </p>
          <p className="muted small" style={{ marginTop: 8 }}>
            Os créditos do plano entram a cada renovação. <Link href="/cliente/conta" className="link">Ver assinatura</Link>
          </p>
        </section>

        <section className="card">
          <h2>Comprar créditos avulsos</h2>
          <FormAcao action={comprarCreditosAction}>
            <div className="field">
              <span className="label">Pacote</span>
              <div className="chips" role="radiogroup">
                {PACOTES_AVULSOS.map((q, i) => (
                  <label key={q} className="chip" style={{ cursor: "pointer" }}>
                    <input type="radio" name="quantidade" value={q} defaultChecked={i === 0} />
                    {q} créditos · {formatarReais(q * PRECO_CREDITO_AVULSO)}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="metodo">
                Pagar com
              </label>
              <select id="metodo" name="metodo" className="txt">
                {metodos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.descricao}
                  </option>
                ))}
              </select>
            </div>
            <Enviar>Comprar</Enviar>
            {gatewayEhSimulado() && <p className="hint" style={{ marginTop: 8 }}>Pagamento simulado nesta versão: nenhuma cobrança real é feita.</p>}
          </FormAcao>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Extrato</h2>
        {lancamentos.length === 0 ? (
          <p className="vazio">Nenhuma movimentação ainda.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="extrato">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th className="num">Créditos</th>
                </tr>
              </thead>
              <tbody>
                {lancamentos.map((l) => (
                  <tr key={l.id}>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>
                      {formatarData(l.criado_em)}
                    </td>
                    <td>
                      <span className="muted small">{TIPOS[l.tipo]} · </span>
                      {l.pedido_id ? <Link href={`/cliente/pedidos/${l.pedido_id}`}>{l.descricao}</Link> : l.descricao}
                    </td>
                    <td className={`num ${l.quantidade > 0 ? "pos" : ""}`}>
                      {l.quantidade > 0 ? "+" : ""}
                      {l.quantidade}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
