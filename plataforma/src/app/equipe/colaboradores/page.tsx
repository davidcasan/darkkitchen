import type { Metadata } from "next";
import Link from "next/link";
import {
  desfazerPagamentoColaboradorAction,
  fecharMesColaboradorAction,
  pagarColaboradorAction,
  reabrirMesColaboradorAction,
  salvarFichaColaboradorAction,
  salvarRegrasColaboradoresAction,
} from "@/app/actions/admin";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { PECAS } from "@/domain/catalogo";
import { formatarReais } from "@/domain/catalogo";
import { PAPEIS } from "@/domain/pedido";
import { exigirUsuario } from "@/server/auth";
import { formatarDataHora } from "@/server/datas";
import {
  type ApuracaoColaborador,
  FORMAS,
  FORMAS_PAGAMENTO_REALIZADO,
  apuracaoDoMes,
  hojeBrasilia,
  mesAtual,
  mesValido,
  mesVizinho,
  nomeDoMes,
  regrasColaboradores,
} from "@/server/services/colaboradores";
import { precos } from "@/server/services/precos";
import { TabelaApuracao, horas, dataCurta, situacaoDe } from "./TabelaApuracao";

export const metadata: Metadata = { title: "Colaboradores" };

// Financeiro > Colaboradores: horas PREVISTAS e valores de cada pessoa da equipe no mês,
// fechamento do mês, registro do pagamento e planilha para o contador.
export default async function Colaboradores({ searchParams }: PageProps<"/equipe/colaboradores">) {
  await exigirUsuario(["admin"]);
  const { mes: mesParam } = await searchParams;
  const mes = mesValido(typeof mesParam === "string" ? mesParam : null) ?? mesAtual();
  const lista = apuracaoDoMes(mes);
  const regras = regrasColaboradores();
  const custos = precos().custos;
  const ativos = lista.filter((a) => a.linhas.length > 0 || a.ficha.forma === "mensal" || a.fechamento);
  const soma = (f: (a: ApuracaoColaborador) => number) => ativos.reduce((s, a) => s + f(a), 0);
  const total = soma((a) => a.valor);
  const pago = soma((a) => (a.fechamento?.pago_em ? a.valor : 0));
  const aPagar = soma((a) => (a.fechamento && !a.fechamento.pago_em ? a.valor : 0));
  const emAberto = soma((a) => (a.fechamento ? 0 : a.valor));
  const abertos = ativos.filter((a) => !a.fechamento).length;
  const hoje = hojeBrasilia();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Colaboradores</h1>
          <p>
            Horas e valores da equipe no mês, sempre em <b>horas previstas</b> (as da tela Preços), pelos pedidos aprovados no mês.
          </p>
        </div>
        <a className="btn" href={`/api/v1/financeiro/colaboradores?mes=${mes}`}>
          Baixar planilha (.csv)
        </a>
      </div>

      <div className="row-between" style={{ marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn btn-sm" href={`/equipe/colaboradores?mes=${mesVizinho(mes, -1)}`} aria-label="Mês anterior">
            ‹
          </Link>
          <b style={{ minWidth: 170, textAlign: "center" }}>{nomeDoMes(mes)}</b>
          {mes < mesAtual() ? (
            <Link className="btn btn-sm" href={`/equipe/colaboradores?mes=${mesVizinho(mes, 1)}`} aria-label="Próximo mês">
              ›
            </Link>
          ) : (
            <span className="btn btn-sm" aria-hidden="true" style={{ opacity: 0.35 }}>
              ›
            </span>
          )}
        </div>
        {abertos > 0 && (
          <FormAcao
            action={fecharMesColaboradorAction}
            confirmar={`Fechar ${nomeDoMes(mes)} de ${abertos} colaborador${abertos > 1 ? "es" : ""}? Os números ficam congelados para o pagamento.`}
          >
            <input type="hidden" name="mes" value={mes} />
            <Enviar className="btn btn-sm btn-primary" enviando="Fechando...">
              Fechar o mês de todos
            </Enviar>
          </FormAcao>
        )}
      </div>

      <div className="grid-kpi" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <span>Total do mês</span>
          <b>{formatarReais(total)}</b>
          <small className="muted">{horas(soma((a) => a.horasDesigner + a.horasDiretor))} previstas</small>
        </div>
        <div className="kpi">
          <span>Em aberto (não fechado)</span>
          <b>{formatarReais(emAberto)}</b>
        </div>
        <div className="kpi">
          <span>Fechado, a pagar</span>
          <b>{formatarReais(aPagar)}</b>
        </div>
        <div className="kpi">
          <span>Pago</span>
          <b>{formatarReais(pago)}</b>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 16, overflowX: "auto" }}>
        <h2>Resumo de {nomeDoMes(mes)}</h2>
        {ativos.length === 0 ? (
          <p className="muted small">Nenhum pedido aprovado neste mês e nenhum colaborador com valor fixo.</p>
        ) : (
          <table className="extrato">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Forma</th>
                <th className="num">Pedidos</th>
                <th className="num">Horas designer</th>
                <th className="num">Horas diretor</th>
                <th className="num">Valor</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {ativos.map((a) => (
                <tr key={a.usuario.id}>
                  <td>
                    <a href={`#colab-${a.usuario.id}`}>{a.usuario.nome}</a>{" "}
                    <small className="muted">{PAPEIS[a.usuario.papel as keyof typeof PAPEIS] ?? a.usuario.papel}</small>
                  </td>
                  <td className="small">{FORMAS[a.ficha.forma]}</td>
                  <td className="num">{new Set(a.linhas.map((l) => l.pedidoId)).size}</td>
                  <td className="num">{horas(a.horasDesigner)}</td>
                  <td className="num">{horas(a.horasDiretor)}</td>
                  <td className="num">
                    <b>{formatarReais(a.valor)}</b>
                  </td>
                  <td className="small">{situacaoDe(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {lista.map((a) => (
        <details key={a.usuario.id} id={`colab-${a.usuario.id}`} className="card" style={{ marginBottom: 12 }}>
          <summary style={{ cursor: "pointer" }}>
            <b>{a.usuario.nome}</b>{" "}
            <span className="muted small">
              {PAPEIS[a.usuario.papel as keyof typeof PAPEIS] ?? a.usuario.papel}
              {!a.usuario.ativo && " · desativado"} · {FORMAS[a.ficha.forma]} · {formatarReais(a.valor)} · {situacaoDe(a)}
            </span>
          </summary>

          <div style={{ marginTop: 14 }}>
            <TabelaApuracao a={a} />
          </div>

          <div className="row" style={{ flexWrap: "wrap", gap: 12, marginTop: 14, alignItems: "flex-start" }}>
            {!a.fechamento ? (
              (a.linhas.length > 0 || a.ficha.forma === "mensal") && (
                <FormAcao
                  action={fecharMesColaboradorAction}
                  confirmar={`Fechar ${nomeDoMes(mes)} de ${a.usuario.nome} em ${formatarReais(a.valor)}?`}
                >
                  <input type="hidden" name="mes" value={mes} />
                  <input type="hidden" name="usuario" value={a.usuario.id} />
                  <Enviar className="btn btn-sm btn-primary" enviando="Fechando...">
                    Fechar o mês
                  </Enviar>
                </FormAcao>
              )
            ) : !a.fechamento.pago_em ? (
              <>
                <FormAcao action={pagarColaboradorAction}>
                  <input type="hidden" name="mes" value={mes} />
                  <input type="hidden" name="usuario" value={a.usuario.id} />
                  <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label" htmlFor={`data-${a.usuario.id}`}>
                        Pago em
                      </label>
                      <input id={`data-${a.usuario.id}`} name="data" type="date" className="txt" defaultValue={hoje} required />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label" htmlFor={`forma-${a.usuario.id}`}>
                        Como
                      </label>
                      <select id={`forma-${a.usuario.id}`} name="forma_pagamento" className="txt" defaultValue="Pix">
                        {FORMAS_PAGAMENTO_REALIZADO.map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0, flex: 1, minWidth: 180 }}>
                      <label className="label" htmlFor={`obs-${a.usuario.id}`}>
                        Observação <span className="opt">(opcional)</span>
                      </label>
                      <input id={`obs-${a.usuario.id}`} name="observacao" className="txt" placeholder="Ex.: comprovante 123, banco X" />
                    </div>
                    <Enviar className="btn btn-sm btn-primary" enviando="Registrando...">
                      Registrar pagamento
                    </Enviar>
                  </div>
                </FormAcao>
                <FormAcao action={reabrirMesColaboradorAction} confirmar="Reabrir? Os números voltam a ser calculados com os dados atuais.">
                  <input type="hidden" name="mes" value={mes} />
                  <input type="hidden" name="usuario" value={a.usuario.id} />
                  <Enviar className="btn btn-sm" enviando="...">
                    Reabrir
                  </Enviar>
                </FormAcao>
              </>
            ) : (
              <>
                <p className="small" style={{ margin: 0 }}>
                  Pago em <b>{dataCurta(a.fechamento.pago_em)}</b> por {a.fechamento.forma_pagamento}
                  {a.fechamento.observacao ? ` · ${a.fechamento.observacao}` : ""}
                  {a.fechamento.pago_por_nome ? ` · registrado por ${a.fechamento.pago_por_nome}` : ""}
                </p>
                <FormAcao action={desfazerPagamentoColaboradorAction} confirmar="Desfazer o registro deste pagamento?">
                  <input type="hidden" name="mes" value={mes} />
                  <input type="hidden" name="usuario" value={a.usuario.id} />
                  <Enviar className="btn btn-sm" enviando="...">
                    Desfazer pagamento
                  </Enviar>
                </FormAcao>
              </>
            )}
          </div>
          {a.fechamento && (
            <p className="muted small" style={{ marginTop: 8 }}>
              Fechado em {formatarDataHora(a.fechamento.fechado_em)}
              {a.fechamento.fechado_por_nome ? ` por ${a.fechamento.fechado_por_nome}` : ""}: os números acima estão congelados.
            </p>
          )}

          <FormAcao action={salvarFichaColaboradorAction}>
            <input type="hidden" name="usuario" value={a.usuario.id} />
            <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <h3 style={{ marginTop: 0 }}>Forma de pagamento</h3>
              <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
                <div className="field" style={{ minWidth: 200 }}>
                  <label className="label" htmlFor={`forma-pg-${a.usuario.id}`}>
                    Como é pago
                  </label>
                  <select id={`forma-pg-${a.usuario.id}`} name="forma" className="txt" defaultValue={a.ficha.forma}>
                    {Object.entries(FORMAS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ minWidth: 160 }}>
                  <label className="label" htmlFor={`hora-${a.usuario.id}`}>
                    Valor por hora (R$) <span className="opt">(por hora)</span>
                  </label>
                  <input
                    id={`hora-${a.usuario.id}`}
                    name="valor_hora"
                    className="txt"
                    inputMode="decimal"
                    defaultValue={a.ficha.valorHora ?? ""}
                    placeholder={`Padrão: ${custos.valorHoraDesigner} / ${custos.valorHoraDiretor}`}
                  />
                </div>
                <div className="field" style={{ minWidth: 160 }}>
                  <label className="label" htmlFor={`mensal-${a.usuario.id}`}>
                    Valor mensal (R$) <span className="opt">(fixo mensal)</span>
                  </label>
                  <input id={`mensal-${a.usuario.id}`} name="valor_mensal" className="txt" inputMode="decimal" defaultValue={a.ficha.valorMensal ?? ""} />
                </div>
              </div>
              <span className="label">
                Valor por peça (R$) <span className="opt">(por peça; cancelado com versão enviada paga metade)</span>
              </span>
              <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
                {PECAS.map((p) => (
                  <div key={p.id} className="field" style={{ minWidth: 130 }}>
                    <label className="label small" htmlFor={`peca-${p.id}-${a.usuario.id}`}>
                      {p.nome}
                    </label>
                    <input
                      id={`peca-${p.id}-${a.usuario.id}`}
                      name={`peca_${p.id}`}
                      className="txt"
                      inputMode="decimal"
                      defaultValue={a.ficha.valoresPeca[p.id] || ""}
                    />
                  </div>
                ))}
              </div>
              <span className="hint" style={{ display: "block", marginBottom: 10 }}>
                Valor por hora em branco usa o padrão da tela Preços (designer R$ {custos.valorHoraDesigner}, diretor R$ {custos.valorHoraDiretor}).
                Mudanças valem para os meses ainda não fechados.
              </span>
              <Enviar className="btn btn-sm" enviando="Salvando...">
                Salvar forma de pagamento
              </Enviar>
            </div>
          </FormAcao>
        </details>
      ))}

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Regras da apuração</h2>
        <p className="muted small" style={{ marginBottom: 12 }}>
          Designer: horas previstas da peça + adicionais + retrabalho das rodadas pedidas pelo cliente ({custos.retrabalhoPct}% das horas
          por rodada). Diretor de arte: curadoria da peça + {custos.retrabalhoHorasDiretor} h por rodada, divididas entre quem fez os
          controles de qualidade. O pedido entra no mês da primeira aprovação. Locução e roteiro são de terceiros e não entram.
        </p>
        <FormAcao action={salvarRegrasColaboradoresAction}>
          <label className="check" style={{ marginBottom: 8 }}>
            <input type="checkbox" name="reprovacao" value="1" defaultChecked={regras.pagarReprovacaoInterna} />
            <span>Pagar ao designer o retrabalho das reprovações no controle de qualidade (erro dele)</span>
          </label>
          <label className="check" style={{ marginBottom: 12 }}>
            <input type="checkbox" name="cancelados" value="1" defaultChecked={regras.pagarCancelados} />
            <span>Contar pedidos cancelados depois de o designer enviar versão (no mês do cancelamento)</span>
          </label>
          <Enviar className="btn btn-sm">Salvar regras</Enviar>
        </FormAcao>
      </section>
    </>
  );
}
