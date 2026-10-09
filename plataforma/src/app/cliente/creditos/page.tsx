import type { Metadata } from "next";
import Link from "next/link";
import { formatarReais } from "@/domain/catalogo";
import { planoPorId } from "@/domain/precos";
import { assinaturaDo } from "@/server/services/assinaturas";
import { precos } from "@/server/services/precos";
import { exigirUsuario } from "@/server/auth";
import { formatarData } from "@/server/datas";
import { extrato, saldo } from "@/server/services/creditos";

export const metadata: Metadata = { title: "Créditos" };

const TIPOS: Record<string, string> = {
  assinatura: "Plano",
  compra: "Compra avulsa",
  pedido: "Pedido",
  revisao_extra: "Revisão extra",
  estorno: "Devolução",
  ajuste: "Ajuste",
  expiracao: "Expiração",
};

export default async function CreditosCliente() {
  const u = await exigirUsuario(["cliente"]);
  const lancamentos = extrato(u.id);
  const assinatura = assinaturaDo(u.id);
  const plano = planoPorId(precos(), assinatura?.plano_id);
  const ativa = assinatura?.status === "ativa";

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
            Créditos vêm do seu plano de assinatura, a cada renovação, e valem até o fim do período do plano.
          </p>
        </section>

        <section className="card">
          <h2>De onde vêm os créditos</h2>
          {plano && ativa && assinatura!.inadimplente_desde ? (
            <p className="small">
              O pagamento da renovação do plano <b>{plano.nome}</b> está pendente. Os créditos do novo período entram assim que ele
              for aprovado.
            </p>
          ) : plano && ativa ? (
            <p className="small">
              Seu plano <b>{plano.nome}</b> traz <b>{plano.creditosMes} créditos</b> por {formatarReais(plano.precoMes)}/mês. Os
              créditos valem até <b>{formatarData(assinatura!.periodo_fim)}</b>: o saldo que sobrar expira nessa data e
              {assinatura!.renovacao_automatica ? " os créditos do novo período entram." : " a assinatura termina (renovação desligada)."}
            </p>
          ) : (
            <p className="small">Você está sem assinatura ativa, então não recebe novos créditos. O saldo atual expira no fim do mês.</p>
          )}
          <p className="muted small" style={{ marginTop: 10, marginBottom: 14 }}>
            Precisa de mais créditos agora? Suba de plano: a diferença de créditos entra na hora.
          </p>
          <Link href="/cliente/conta" className="btn">
            {ativa ? "Ver planos" : "Assinar um plano"}
          </Link>
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
