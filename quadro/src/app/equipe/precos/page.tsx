import type { Metadata } from "next";
import { exigirUsuario } from "@/server/auth";
import { formatarDataHora } from "@/server/datas";
import { assinantesPorPlano, historicoPrecos, precos } from "@/server/services/precos";
import { EditorPrecos } from "./EditorPrecos";

export const metadata: Metadata = { title: "Preços" };

export default async function PrecosPage() {
  await exigirUsuario(["admin"]);
  const historico = historicoPrecos();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Preços</h1>
          <p>
            Valor do crédito, planos (a única forma de o cliente comprar créditos), prazos e custos de produção. Os créditos de
            cada atividade são calculados a partir do custo e do valor do crédito. Ao salvar, o
            site, o cadastro, o briefing e
            as assinaturas passam a usar os novos valores na hora. Pedidos já feitos mantêm o valor cobrado.
          </p>
        </div>
      </div>

      <EditorPrecos inicial={precos()} assinantes={assinantesPorPlano()} />

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Histórico de alterações</h2>
        {historico.length === 0 ? (
          <p className="muted small">Nenhuma alteração ainda: o sistema está usando os valores padrão.</p>
        ) : (
          <ul className="lista">
            {historico.map((h) => (
              <li key={h.id} style={{ padding: "10px 0" }}>
                <span className="small">{h.resumo}</span>
                <br />
                <small className="muted">
                  {formatarDataHora(h.criado_em)}
                  {h.autor ? ` · ${h.autor}` : ""}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
