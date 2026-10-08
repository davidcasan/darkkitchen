import type { Metadata } from "next";
import Link from "next/link";
import {
  adicionarMetodoAction,
  cancelarAssinaturaAction,
  metodoPadraoAction,
  reativarAssinaturaAction,
  removerMetodoAction,
  trocarPlanoAction,
} from "@/app/actions/cliente";
import { alterarSenhaAction, sairAction } from "@/app/actions/conta";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { formatarReais } from "@/domain/catalogo";
import { planoPorId } from "@/domain/precos";
import { precos } from "@/server/services/precos";
import { exigirUsuario } from "@/server/auth";
import { formatarData } from "@/server/datas";
import { assinaturaDo, simularTroca } from "@/server/services/assinaturas";
import { gatewayEhSimulado, listarFaturas, listarMetodos } from "@/server/services/pagamentos";

export const metadata: Metadata = { title: "Conta" };

const STATUS_FATURA = { paga: "Paga", pendente: "Pendente", falhou: "Recusada" };

export default async function ContaCliente() {
  const u = await exigirUsuario(["cliente"]);
  const assinatura = assinaturaDo(u.id);
  const tabela = precos();
  const plano = planoPorId(tabela, assinatura?.plano_id);
  // Planos à venda, mais o atual do cliente mesmo que tenha sido ocultado.
  const planos = tabela.planos.filter((p) => p.ativo || p.id === plano?.id);
  const ativa = assinatura?.status === "ativa";
  const proximo = planoPorId(tabela, assinatura?.plano_proximo);
  const metodos = listarMetodos(u.id);
  const faturas = listarFaturas(u.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Conta</h1>
          <p>
            {u.nome} · {u.email}
          </p>
        </div>
        <Link href="/cliente/marcas" className="btn">
          Minhas marcas
        </Link>
      </div>

      {gatewayEhSimulado() && (
        <p className="alerta alerta-aviso" style={{ marginBottom: 16 }}>
          Modo de teste: pagamentos são simulados e aprovados na hora, sem cobrança real.
        </p>
      )}

      <section className="card">
        <div className="row-between">
          <h2 style={{ margin: 0 }}>Assinatura</h2>
          {assinatura && (
            <span className="badge" data-tom={ativa ? "ok" : "parado"}>
              {ativa ? "Ativa" : "Cancelada"}
            </span>
          )}
        </div>
        <p className="muted small" style={{ margin: "8px 0 16px" }}>
          {ativa
            ? `Plano ${plano?.nome}: ${plano?.creditosMes} créditos por ${formatarReais(plano?.precoMes ?? 0)}/mês. Próxima renovação em ${formatarData(assinatura!.periodo_fim)}.`
            : "Sem renovação automática. Seus créditos continuam valendo."}
        </p>
        {ativa && proximo && (
          <p className="alerta alerta-aviso" style={{ marginBottom: 16 }}>
            Seu plano muda para <b>{proximo.nome}</b> na renovação de {formatarData(assinatura!.periodo_fim)}. Para desistir, escolha
            o plano {plano?.nome} abaixo e confirme.
          </p>
        )}
        <FormAcao action={ativa ? trocarPlanoAction : reativarAssinaturaAction}>
          <div className="grid-kpi" role="radiogroup" aria-label="Planos">
            {planos.map((p) => {
              const sim = ativa ? simularTroca(plano?.id, p.id) : null;
              const atual = ativa && p.id === plano?.id;
              return (
                <label key={p.id} className="kpi" style={{ cursor: "pointer" }} data-atual={atual}>
                  <span className="row">
                    <input
                      type="radio"
                      name="plano"
                      value={p.id}
                      defaultChecked={p.id === (plano?.id ?? planos.find((x) => x.destaque)?.id ?? planos[0]?.id)}
                    />
                    {p.nome}
                  </span>
                  <b style={{ fontSize: 22 }}>{formatarReais(p.precoMes)}</b>
                  <small>{p.creditosMes} créditos/mês</small>
                  {atual && (
                    <span style={{ display: "block", marginTop: 8 }}>
                      <span className="badge" style={{ display: "inline-flex" }}>
                        Plano atual
                      </span>
                    </span>
                  )}
                  {sim?.tipo === "upgrade" && (
                    <small style={{ display: "block", marginTop: 8, color: "var(--ok)", fontWeight: 600 }}>
                      Na hora: +{sim.creditos} créditos{sim.cobrar > 0 ? ` por ${formatarReais(sim.cobrar)}` : ""}
                    </small>
                  )}
                  {sim?.tipo === "agendada" && (
                    <small style={{ display: "block", marginTop: 8 }}>Vale a partir de {formatarData(assinatura!.periodo_fim)}</small>
                  )}
                </label>
              );
            })}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <Enviar>{ativa ? "Trocar plano" : "Reativar assinatura"}</Enviar>
            {ativa && (
              <span className="hint">
                Plano maior: vale na hora (você paga a diferença e recebe os créditos extras agora). Plano menor: vale na próxima
                renovação.
              </span>
            )}
          </div>
        </FormAcao>
        {ativa && (
          <FormAcao action={cancelarAssinaturaAction} confirmar="Cancelar a renovação automática? Seus créditos continuam valendo.">
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <Enviar className="btn btn-sm btn-danger">Cancelar assinatura</Enviar>
            </div>
          </FormAcao>
        )}
      </section>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="card">
          <h2>Formas de pagamento</h2>
          <ul className="lista" style={{ marginBottom: 16 }}>
            {metodos.map((m) => (
              <li key={m.id} className="row-between" style={{ padding: "10px 0" }}>
                <span>
                  {m.descricao} {m.padrao === 1 && <span className="badge">Padrão</span>}
                </span>
                <span className="row">
                  {m.padrao !== 1 && (
                    <FormAcao action={metodoPadraoAction}>
                      <input type="hidden" name="metodo" value={m.id} />
                      <Enviar className="link small" enviando="...">
                        Tornar padrão
                      </Enviar>
                    </FormAcao>
                  )}
                  {metodos.length > 1 && (
                    <FormAcao action={removerMetodoAction} confirmar="Remover esta forma de pagamento?">
                      <input type="hidden" name="metodo" value={m.id} />
                      <Enviar className="link small" enviando="...">
                        Remover
                      </Enviar>
                    </FormAcao>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <details>
            <summary className="link">+ Adicionar forma de pagamento</summary>
            <FormAcao action={adicionarMetodoAction}>
              <div className="field" style={{ marginTop: 12 }}>
                <span className="label">Tipo</span>
                <div className="chips">
                  <label className="chip">
                    <input type="radio" name="tipo" value="cartao" defaultChecked /> Cartão de crédito
                  </label>
                  <label className="chip">
                    <input type="radio" name="tipo" value="pix" /> Pix
                  </label>
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="final">
                  Últimos 4 dígitos do cartão <span className="opt">(simulação)</span>
                </label>
                <input id="final" name="final" className="txt" inputMode="numeric" maxLength={4} placeholder="0000" />
              </div>
              <Enviar className="btn btn-sm">Adicionar</Enviar>
            </FormAcao>
          </details>
        </section>

        <section className="card">
          <h2>Faturas</h2>
          {faturas.length === 0 ? (
            <p className="muted small">Nenhuma fatura ainda.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="extrato">
                <tbody>
                  {faturas.map((f) => (
                    <tr key={f.id}>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {formatarData(f.criado_em)}
                      </td>
                      <td>
                        {f.descricao}
                        <br />
                        <small className="muted">
                          {f.metodo} · {STATUS_FATURA[f.status]}
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

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="card">
          <h2>Alterar senha</h2>
          <FormAcao action={alterarSenhaAction}>
            <div className="field">
              <label className="label" htmlFor="atual">
                Senha atual
              </label>
              <input id="atual" name="atual" type="password" className="txt" autoComplete="current-password" required />
            </div>
            <div className="field">
              <label className="label" htmlFor="nova">
                Nova senha
              </label>
              <input id="nova" name="nova" type="password" className="txt" autoComplete="new-password" minLength={8} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="confirma">
                Confirme a nova senha
              </label>
              <input id="confirma" name="confirma" type="password" className="txt" autoComplete="new-password" minLength={8} required />
            </div>
            <Enviar>Salvar nova senha</Enviar>
          </FormAcao>
        </section>
        <section className="card">
          <h2>Sair</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>
            Encerra a sessão neste navegador.
          </p>
          <form action={sairAction}>
            <button type="submit" className="btn btn-danger">
              Sair da conta
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
