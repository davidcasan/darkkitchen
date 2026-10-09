import type { Metadata } from "next";
import Link from "next/link";
import { cancelarCobrancaAction, confirmarPagamentoAction, salvarPixAction } from "@/app/actions/admin";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { formatarReais } from "@/domain/catalogo";
import { exigirUsuario } from "@/server/auth";
import { agoraSql, formatarData, formatarDataHora } from "@/server/datas";
import { varios } from "@/server/db";
import { cobrancasPixPendentes } from "@/server/services/assinaturas";
import { configPix } from "@/server/services/pix";

export const metadata: Metadata = { title: "Pagamentos" };

export default async function Pagamentos() {
  await exigirUsuario(["admin"]);
  const pix = configPix();
  const pendentes = cobrancasPixPendentes();
  const agora = agoraSql();
  const confirmadas = varios<{
    id: number;
    descricao: string;
    valor_centavos: number;
    confirmada_em: string;
    cliente: string;
    admin: string | null;
  }>(
    `SELECT f.id, f.descricao, f.valor_centavos, f.confirmada_em, u.nome cliente, a.nome admin
     FROM faturas f JOIN usuarios u ON u.id = f.usuario_id LEFT JOIN usuarios a ON a.id = f.confirmada_por
     WHERE f.status = 'paga' AND f.confirmada_em IS NOT NULL ORDER BY f.confirmada_em DESC LIMIT 10`,
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pagamentos</h1>
          <p>
            Cobranças por Pix aguardando confirmação. Confirme só depois de ver o dinheiro na conta: é aí que os créditos são
            liberados.
          </p>
        </div>
      </div>

      {!pix && (
        <p className="alerta alerta-aviso" style={{ marginBottom: 16 }}>
          O Pix ainda não está configurado: os clientes não veem a opção de pagar por Pix. Preencha os dados do recebedor abaixo.
        </p>
      )}

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Aguardando confirmação {pendentes.length > 0 && <span className="badge">{pendentes.length}</span>}</h2>
        {pendentes.length === 0 ? (
          <p className="muted small">Nenhuma cobrança aberta.</p>
        ) : (
          <ul className="lista">
            {pendentes.map((c) => {
              const vencida = !!c.vence_em && c.vence_em < agora;
              return (
                <li key={c.id} style={{ padding: "14px 0" }}>
                  <div className="row-between" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <b>{formatarReais(c.valor_centavos / 100)}</b> · {c.descricao}
                      <br />
                      <small className="muted">
                        <Link href={`/equipe/contas/${c.usuario_id}`}>{c.cliente_nome}</Link>
                        {c.empresa ? ` (${c.empresa})` : ""} · {c.cliente_email} · gerada em {formatarDataHora(c.criado_em)}
                        {c.vence_em && ` · ${vencida ? "venceu" : "vence"} em ${formatarData(c.vence_em)}`} · identificador DK
                        {String(c.id).padStart(6, "0")}
                      </small>
                      {c.aviso_pago_em && (
                        <span style={{ display: "block", marginTop: 6 }}>
                          <span className="badge" data-tom="acao">
                            Cliente avisou que pagou em {formatarDataHora(c.aviso_pago_em)}
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="row">
                      <FormAcao
                        action={confirmarPagamentoAction}
                        confirmar={`Confirmar o recebimento de ${formatarReais(c.valor_centavos / 100)} de ${c.cliente_nome}? Os créditos serão liberados.`}
                      >
                        <input type="hidden" name="fatura" value={c.id} />
                        <Enviar className="btn btn-primary btn-sm" enviando="Confirmando...">
                          Confirmar pagamento
                        </Enviar>
                      </FormAcao>
                      <FormAcao action={cancelarCobrancaAction} confirmar="Cancelar esta cobrança? O cliente será avisado.">
                        <input type="hidden" name="fatura" value={c.id} />
                        <Enviar className="btn btn-sm btn-danger" enviando="...">
                          Cancelar
                        </Enviar>
                      </FormAcao>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Recebimento por Pix</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>
            Os QR Codes são gerados com estes dados, no padrão do Banco Central. Cada cobrança leva um identificador (ex.: DK000123)
            que muitos bancos mostram no extrato. Antes de confirmar, confira o valor e quem pagou.
          </p>
          <FormAcao action={salvarPixAction}>
            <div className="field">
              <label className="label" htmlFor="pix-chave">
                Chave Pix
              </label>
              <input
                id="pix-chave"
                name="chave"
                className="txt"
                required
                defaultValue={pix?.chave}
                placeholder="CNPJ, CPF, e-mail, telefone ou chave aleatória"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="pix-nome">
                Nome do recebedor <span className="opt">(como está no banco, até 25 letras)</span>
              </label>
              <input id="pix-nome" name="nome" className="txt" required maxLength={25} defaultValue={pix?.nome} />
            </div>
            <div className="field">
              <label className="label" htmlFor="pix-cidade">
                Cidade <span className="opt">(até 15 letras)</span>
              </label>
              <input id="pix-cidade" name="cidade" className="txt" required maxLength={15} defaultValue={pix?.cidade} />
            </div>
            <Enviar>Salvar</Enviar>
          </FormAcao>
        </section>

        <section className="card">
          <h2>Confirmados recentemente</h2>
          {confirmadas.length === 0 ? (
            <p className="muted small">Nenhum pagamento por Pix confirmado ainda.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="extrato">
                <tbody>
                  {confirmadas.map((f) => (
                    <tr key={f.id}>
                      <td>
                        {f.cliente}
                        <br />
                        <small className="muted">
                          {f.descricao} · {formatarDataHora(f.confirmada_em)}
                          {f.admin ? ` · por ${f.admin}` : ""}
                        </small>
                      </td>
                      <td className="num">{formatarReais(f.valor_centavos / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
