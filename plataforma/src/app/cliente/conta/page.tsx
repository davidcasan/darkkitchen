import type { Metadata } from "next";
import Link from "next/link";
import { AbrirAtendimento } from "@/components/app/Atendimento";
import {
  adicionarMetodoAction,
  metodoPadraoAction,
  pagarRenovacaoAction,
  removerMetodoAction,
  renovacaoAction,
  trocarPlanoAction,
} from "@/app/actions/cliente";
import { alterarSenhaAction, sairAction } from "@/app/actions/conta";
import { Confirmacao } from "@/components/app/Confirmacao";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { formatarReais } from "@/domain/catalogo";
import { PLANO_PERSONALIZADO } from "@/domain/precos";
import { precos } from "@/server/services/precos";
import { exigirUsuario } from "@/server/auth";
import { formatarData } from "@/server/datas";
import { assinaturaDo, cobrancasPixDo, fimDaCarencia, planoDaAssinatura, simularTroca } from "@/server/services/assinaturas";
import { CARTAO_ATIVO, gatewayEhSimulado, listarFaturas, listarMetodos } from "@/server/services/pagamentos";
import { pixDisponivel } from "@/server/services/pix";
import { CobrancaPix } from "@/components/app/CobrancaPix";
import { PreferenciaEmail } from "@/components/app/PreferenciaEmail";

export const metadata: Metadata = { title: "Conta" };

const STATUS_FATURA = { paga: "Paga", pendente: "Aguardando pagamento", falhou: "Recusada", cancelada: "Cancelada" };

export default async function ContaCliente({ searchParams }: PageProps<"/cliente/conta">) {
  const u = await exigirUsuario(["cliente"]);
  const { ok } = await searchParams;
  const assinatura = assinaturaDo(u.id);
  const tabela = precos();
  const plano = planoDaAssinatura(assinatura);
  const ativa = assinatura?.status === "ativa";
  const noPersonalizado = ativa && plano?.id === PLANO_PERSONALIZADO;
  // Planos à venda, mais o atual do cliente mesmo que tenha sido ocultado (ou o Personalizado dele).
  const planos = [...(noPersonalizado && plano ? [plano] : []), ...tabela.planos.filter((p) => p.ativo || p.id === plano?.id)];
  const renova = ativa && assinatura.renovacao_automatica === 1;
  const pendente = ativa && !!assinatura.inadimplente_desde;
  const cobrancasPix = cobrancasPixDo(u.id);
  const temPix = pixDisponivel();
  const proximo = planoDaAssinatura(assinatura, assinatura?.plano_proximo);
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

      <Confirmacao texto={ok === "pago" ? "Pagamento aprovado. Seu plano está em dia e os créditos do novo período entraram no saldo." : null} />

      {CARTAO_ATIVO && gatewayEhSimulado() && (
        <p className="alerta alerta-aviso" style={{ marginBottom: 16 }}>
          Fase de testes: o cartão é simulado (aprovado na hora, sem cobrança real; o de final 0000 é sempre recusado). O Pix é
          real: os créditos entram depois que confirmamos o pagamento.
        </p>
      )}

      {cobrancasPix.length > 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2>Pix aguardando pagamento</h2>
          <div className="stack">
            {cobrancasPix.map((c) => (
              <CobrancaPix key={c.id} cobranca={c} />
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="row-between">
          <h2 style={{ margin: 0 }}>Assinatura</h2>
          {assinatura && (
            <span className="badge" data-tom={pendente ? "acao" : ativa ? (renova ? "ok" : "andamento") : "parado"}>
              {pendente ? "Pagamento pendente" : ativa ? (renova ? "Ativa" : "Não renova") : "Encerrada"}
            </span>
          )}
        </div>
        <p className="muted small" style={{ margin: "8px 0 16px" }}>
          {!ativa
            ? "Sem assinatura ativa. Escolha um plano para voltar a receber créditos (sem assinatura, o saldo expira no fim do mês)."
            : pendente
              ? `Plano ${plano?.nome}: aguardando o pagamento da renovação.`
              : renova
                ? `Plano ${plano?.nome}: ${plano?.creditosMes} créditos por ${formatarReais(plano?.precoMes ?? 0)}/mês. Renova automaticamente em ${formatarData(assinatura.periodo_fim)}; os créditos não usados expiram nessa data.`
                : `Plano ${plano?.nome}: a assinatura termina em ${formatarData(assinatura.periodo_fim)}, sem nova cobrança. Os créditos não usados expiram nessa data.`}
        </p>
        {pendente && cobrancasPix.length === 0 && (
          <div className="alerta alerta-aviso" style={{ marginBottom: 16 }}>
          <FormAcao action={pagarRenovacaoAction}>
            <p style={{ margin: "0 0 10px" }}>
              Não conseguimos cobrar a renovação. Enquanto o pagamento não for aprovado, novos créditos não entram. Atualize a forma de
              pagamento abaixo e tente de novo até <b>{formatarData(fimDaCarencia(assinatura)!)}</b>; depois disso a assinatura termina.
              Também tentamos de novo automaticamente uma vez por dia.
            </p>
            <Enviar className="btn btn-sm btn-primary" enviando="Cobrando...">
              Tentar pagar agora
            </Enviar>
          </FormAcao>
          </div>
        )}
        {renova && !pendente && proximo && (
          <p className="alerta alerta-aviso" style={{ marginBottom: 16 }}>
            Seu plano muda para <b>{proximo.nome}</b> na renovação de {formatarData(assinatura.periodo_fim)}. Para desistir, escolha
            o plano {plano?.nome} abaixo e confirme.
          </p>
        )}
        <FormAcao action={trocarPlanoAction}>
          <div className="grid-kpi" role="radiogroup" aria-label="Planos">
            {planos.map((p) => {
              const sim = ativa && !pendente ? simularTroca(plano, p.id) : null;
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
                    <small style={{ display: "block", marginTop: 8 }}>
                      {renova ? `Vale a partir de ${formatarData(assinatura.periodo_fim)}` : "Ligue a renovação para agendar"}
                    </small>
                  )}
                </label>
              );
            })}
            {!noPersonalizado && (
              <div className="kpi">
                <span>Personalizado</span>
                <small>Créditos e valor de acordo com a sua necessidade.</small>
                <span style={{ display: "block", marginTop: 10 }}>
                  <AbrirAtendimento className="btn btn-sm">Falar com o atendimento</AbrirAtendimento>
                </span>
              </div>
            )}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <Enviar>{ativa ? "Trocar plano" : "Assinar plano"}</Enviar>
            {ativa && (
              <span className="hint">
                Plano maior: vale na hora (você paga a diferença e recebe os créditos extras agora). Plano menor: vale na próxima
                renovação.
              </span>
            )}
          </div>
        </FormAcao>
        {ativa && (
          <FormAcao
            action={renovacaoAction}
            confirmar={
              renova
                ? pendente
                  ? "Desligar a renovação encerra a assinatura agora, sem cobrança. Continuar?"
                  : `Desligar a renovação automática? A assinatura vale até ${formatarData(assinatura.periodo_fim)} e os créditos não usados expiram nessa data.`
                : undefined
            }
          >
            <div className="row-between" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)", flexWrap: "wrap", gap: 12 }}>
              <span>
                <b>Renovação automática</b>{" "}
                <span className="badge" data-tom={renova ? "ok" : "parado"}>
                  {renova ? "Ligada" : "Desligada"}
                </span>
                <br />
                <small className="muted">
                  {renova
                    ? CARTAO_ATIVO
                      ? "Cobramos a mensalidade no cartão padrão a cada mês. Você pode desligar quando quiser."
                      : "Todo mês geramos o Pix da mensalidade e avisamos você. Você pode desligar quando quiser."
                    : `Ligue de novo até ${formatarData(assinatura.periodo_fim)} para continuar no plano, sem cobrança agora.`}
                </small>
              </span>
              <input type="hidden" name="ligar" value={renova ? "0" : "1"} />
              <Enviar className={renova ? "btn btn-sm btn-danger" : "btn btn-sm btn-primary"} enviando="Salvando...">
                {renova ? "Desligar renovação" : "Ligar renovação"}
              </Enviar>
            </div>
          </FormAcao>
        )}
      </section>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="card">
          <h2>{CARTAO_ATIVO ? "Formas de pagamento" : "Pagamento"}</h2>
          {!CARTAO_ATIVO ? (
            <p className="muted small">
              Os pagamentos são por <b>Pix</b>: a cada cobrança (mensalidade ou troca de plano) aparece aqui um QR Code. Depois de
              pagar, clique em &quot;Já paguei&quot;; os créditos entram assim que confirmarmos o pagamento.
            </p>
          ) : (
            <>
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
                    {temPix && (
                      <label className="chip">
                        <input type="radio" name="tipo" value="pix" /> Pix
                      </label>
                    )}
                  </div>
                </div>
                <div className="field">
                  <label className="label" htmlFor="final">
                    Últimos 4 dígitos do cartão <span className="opt">(simulação: final 0000 é sempre recusado)</span>
                  </label>
                  <input id="final" name="final" className="txt" inputMode="numeric" maxLength={4} placeholder="0000" />
                </div>
                <Enviar className="btn btn-sm">Adicionar</Enviar>
              </FormAcao>
            </details>
            </>
          )}
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
        <PreferenciaEmail usuarioId={u.id} />
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
          <h2>Atendimento</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>
            Dúvidas sobre créditos, pagamentos ou sua conta? Fale com o atendimento pelo chat. Para um pedido específico, use o
            chat dentro da página do pedido.
          </p>
          <div style={{ marginBottom: 20 }}>
            <AbrirAtendimento className="btn">Abrir o chat do atendimento</AbrirAtendimento>
          </div>
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
