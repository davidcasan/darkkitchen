import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ajusteAction, aprovarAction, cancelarPedidoAction, rejeitarAction } from "@/app/actions/cliente";
import { BriefingResumo } from "@/components/app/BriefingResumo";
import { Confirmacao } from "@/components/app/Confirmacao";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { StatusBadge } from "@/components/app/Status";
import { VersaoPlayer } from "@/components/app/VersaoPlayer";
import { formatarTamanho, urlArquivo } from "@/components/app/upload";
import { mensagemDe } from "@/domain/mensagens";
import { LINHA_CLIENTE, MOTIVOS_REJEICAO } from "@/domain/pedido";
import { exigirUsuario } from "@/server/auth";
import { formatarData, formatarDataHora, paraSql } from "@/server/datas";
import { ErroNegocio } from "@/server/db";
import { arquivosPorIds } from "@/server/services/arquivos";
import { custoProximoAjuste, pedidoParaUsuario, prazoAprovacaoAutomatica, type PedidoDetalhe } from "@/server/services/pedidos";
import styles from "./pedido.module.css";

export const metadata: Metadata = { title: "Pedido" };

const HISTORICO_CLIENTE: Record<string, string> = {
  criado: "Pedido enviado",
  atribuido: "Designer definido e produção iniciada",
  qualidade_aprovada: "Nova versão disponível para você",
  cliente_aprovou: "Você aprovou a peça",
  cliente_ajuste: "Você pediu ajustes",
  cliente_rejeitou: "Você rejeitou a versão; o pedido voltou para a triagem",
  cancelado: "Pedido cancelado",
  concluido_equipe: "Pedido concluído pela equipe",
  concluido_gerente: "Pedido concluído pela equipe", // nome antigo do evento
  aprovacao_automatica: "Peça aprovada automaticamente (sem resposta no prazo)",
};

export default async function PedidoCliente({ params, searchParams }: PageProps<"/cliente/pedidos/[id]">) {
  const u = await exigirUsuario(["cliente"]);
  const { id } = await params;
  const { novo, ok } = await searchParams;
  const confirmacao = mensagemDe(ok);
  let p: PedidoDetalhe;
  try {
    p = pedidoParaUsuario(Number(id), u);
  } catch (e) {
    if (e instanceof ErroNegocio) notFound();
    throw e;
  }

  const b = p.briefing;
  const arquivos = arquivosPorIds([...b.arquivos.logo, ...b.arquivos.manual, ...b.arquivos.fotos]);
  const custoAjuste = custoProximoAjuste(p, b.duracao);
  const prazoRevisao = prazoAprovacaoAutomatica(p.id);
  const etapaAtual = LINHA_CLIENTE.findIndex((e) => e.status.includes(p.status));
  const aprovada = p.versoes.find((v) => v.status === "aprovada");
  const historico = p.eventos.filter((e) => HISTORICO_CLIENTE[e.tipo] && !(e.tipo === "atribuido" && e.de !== "triagem"));

  return (
    <>
      <Link href="/cliente/pedidos" className="link small">
        ← Pedidos
      </Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <h1>{p.titulo}</h1>
          <p className="row">
            <span className="tnum">{p.codigo}</span>
            <StatusBadge status={p.status} visao="cliente" />
            {p.urgente === 1 && <span className="tag">Urgente</span>}
          </p>
        </div>
      </div>

      <Confirmacao texto={confirmacao} />

      {novo && (
        <p className="alerta alerta-ok" style={{ marginBottom: 16 }}>
          Pedido enviado! {p.creditos} créditos foram debitados. O diretor de arte confere o briefing e pode mandar alguma
          pergunta em até 12 horas.
        </p>
      )}

      {p.status !== "cancelado" && (
        <ol className={styles.progresso} aria-label="Andamento">
          {LINHA_CLIENTE.map((e, i) => (
            <li key={e.chave} data-estado={i < etapaAtual ? "feito" : i === etapaAtual ? "agora" : ""}>
              <span className={styles.kf} />
              <small>{e.rotulo}</small>
            </li>
          ))}
        </ol>
      )}

      <div className="grid-kpi" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <span>{p.status === "aprovado" ? "Concluído" : "Entrega prevista"}</span>
          <b style={{ fontSize: 20 }}>{p.status === "aprovado" ? formatarData(p.atualizado_em) : formatarData(p.entrega_prevista)}</b>
        </div>
        <div className="kpi">
          <span>Rodadas de ajuste</span>
          <b style={{ fontSize: 20 }}>
            {p.revisoes_usadas} de {p.revisoes_incluidas}
          </b>
        </div>
        <div className="kpi">
          <span>Créditos</span>
          <b style={{ fontSize: 20 }}>{p.creditos}</b>
        </div>
      </div>

      <div className={styles.layout}>
        <div className="stack">
          {p.status === "revisao_cliente" && (
            <section className="card" style={{ borderColor: "var(--key)" }}>
              <h2>Sua revisão</h2>
              <p className="muted small" style={{ marginBottom: 14 }}>
                Assista à versão abaixo. Comente direto no vídeo, no segundo exato, e depois aprove ou peça ajustes.
              </p>
              {prazoRevisao && (
                <p className="alerta alerta-aviso small" style={{ marginBottom: 14 }}>
                  Revise até <b>{formatarData(paraSql(prazoRevisao))}</b>. Sem resposta até lá, a peça é aprovada automaticamente.
                </p>
              )}
              <div className={styles.acoes}>
                <FormAcao action={aprovarAction} confirmar="Aprovar a peça? Depois de aprovada, os arquivos finais ficam liberados.">
                  <input type="hidden" name="pedido" value={p.id} />
                  <Enviar>Aprovar peça</Enviar>
                </FormAcao>

                <details className={styles.det}>
                  <summary className="btn">Pedir ajustes</summary>
                  <FormAcao action={ajusteAction}>
                    <input type="hidden" name="pedido" value={p.id} />
                    <div className="field">
                      <label className="label" htmlFor="ajuste-texto">
                        O que precisa mudar?
                      </label>
                      <textarea
                        id="ajuste-texto"
                        name="texto"
                        className="txt"
                        placeholder="Resumo geral. Detalhes de cena ficam melhores como comentários no vídeo."
                      />
                      <span className="hint">
                        Ajustes mudam o que já foi pedido. Mudar a ideia do pedido (outro roteiro, outro formato) conta como novo
                        escopo.
                      </span>
                    </div>
                    {custoAjuste > 0 ? (
                      <label className="check" style={{ marginBottom: 12 }}>
                        <input type="checkbox" name="aceita" value="1" required />
                        <span>
                          Suas {p.revisoes_incluidas} rodadas incluídas já foram usadas. Esta rodada extra custa{" "}
                          <b>{custoAjuste} créditos</b>.
                        </span>
                      </label>
                    ) : (
                      <p className="hint" style={{ marginBottom: 12 }}>
                        Esta é a rodada {p.revisoes_usadas + 1} de {p.revisoes_incluidas} incluídas no pedido.
                      </p>
                    )}
                    <Enviar>Enviar ajustes</Enviar>
                  </FormAcao>
                </details>

                <details className={styles.det}>
                  <summary className="btn btn-danger">Não era isso</summary>
                  <FormAcao action={rejeitarAction}>
                    <input type="hidden" name="pedido" value={p.id} />
                    <p className="small muted" style={{ marginBottom: 12 }}>
                      Use quando a versão está longe do que você precisa. O pedido sai da fila, o diretor de arte conversa com
                      você, ajusta o briefing e a produção recomeça.
                    </p>
                    <div className="field">
                      <label className="label" htmlFor="rej-motivo">
                        Motivo
                      </label>
                      <select id="rej-motivo" name="motivo" className="txt" required defaultValue="">
                        <option value="" disabled>
                          Escolha
                        </option>
                        {MOTIVOS_REJEICAO.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="rej-texto">
                        O que não funcionou?
                      </label>
                      <textarea id="rej-texto" name="texto" className="txt" required />
                    </div>
                    <Enviar className="btn btn-danger">Rejeitar versão</Enviar>
                  </FormAcao>
                </details>
              </div>
            </section>
          )}

          {p.status === "aprovado" && aprovada && (
            <section className="card">
              <h2>Arquivos finais</h2>
              <div className="arquivos">
                <a className="arquivo" href={urlArquivo(aprovada.arquivo_id, true)}>
                  <span>{aprovada.arquivo_nome}</span>
                </a>
                {aprovada.extras.map((a) => (
                  <a key={a.id} className="arquivo" href={urlArquivo(a.id, true)}>
                    <span>{a.nome}</span>
                    <small className="muted">{formatarTamanho(a.tamanho)}</small>
                  </a>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <h2>Versões e comentários</h2>
            <VersaoPlayer
              pedidoId={p.id}
              versoes={p.versoes}
              comentarios={p.comentarios}
              equipe={false}
              podeComentar={p.status !== "cancelado"}
              usuarioId={u.id}
            />
          </section>

          {p.status === "triagem" && (
            <section className="card">
              <h2>Cancelar pedido</h2>
              <p className="muted small" style={{ marginBottom: 12 }}>
                {p.versoes.length === 0
                  ? `O pedido ainda não entrou em produção. Os ${p.creditos} créditos voltam inteiros para você.`
                  : `Como já houve produção, metade dos créditos (${Math.floor(p.creditos / 2)}) volta para você.`}
              </p>
              <FormAcao action={cancelarPedidoAction} confirmar="Cancelar este pedido?">
                <input type="hidden" name="pedido" value={p.id} />
                <Enviar className="btn btn-danger">Cancelar pedido</Enviar>
              </FormAcao>
            </section>
          )}
        </div>

        <div className="stack">
          <section className="card">
            <h2>Briefing</h2>
            <BriefingResumo b={b} arquivos={arquivos} marcaNome={p.marca_nome} mostrarCreditos />
          </section>
          <section className="card">
            <h2>Histórico</h2>
            <ul className={styles.historico}>
              {historico.map((e) => (
                <li key={e.id}>
                  <span>{HISTORICO_CLIENTE[e.tipo]}</span>
                  <small>{formatarDataHora(e.criado_em)}</small>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
