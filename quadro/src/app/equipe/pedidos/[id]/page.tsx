import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  aprovarQualidadeAction,
  atribuirAction,
  cancelarEquipeAction,
  concluirAction,
  reprovarQualidadeAction,
} from "@/app/actions/equipe";
import { BriefingResumo } from "@/components/app/BriefingResumo";
import { Confirmacao } from "@/components/app/Confirmacao";
import { EnviarVersao } from "@/components/app/EnviarVersao";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { StatusBadge } from "@/components/app/Status";
import { VersaoPlayer } from "@/components/app/VersaoPlayer";
import { mensagemDe } from "@/domain/mensagens";
import { EQUIPE, LIMITE_TENTATIVAS, STATUS, TIPOS_ERRO, type StatusPedido, podeExecutar } from "@/domain/pedido";
import { exigirUsuario } from "@/server/auth";
import { formatarData, formatarDataHora, paraSql } from "@/server/datas";
import { ErroNegocio, um } from "@/server/db";
import { arquivosPorIds } from "@/server/services/arquivos";
import { type Evento, type PedidoDetalhe, pedidoParaUsuario, prazoAprovacaoAutomatica } from "@/server/services/pedidos";
import { listarDesigners } from "@/server/services/usuarios";
import styles from "@/app/cliente/pedidos/[id]/pedido.module.css";

export const metadata: Metadata = { title: "Pedido" };

function descreverEvento(e: Evento): string {
  const d = e.detalhe as Record<string, string | number | boolean | undefined>;
  switch (e.tipo) {
    case "criado":
      return `Pedido criado (${d.creditos} créditos)`;
    case "atribuido":
      return d.anterior ? `Reatribuído de ${d.anterior} para ${d.designer}` : `Atribuído a ${d.designer}`;
    case "versao_enviada":
      return `Versão ${d.versao} enviada para controle de qualidade`;
    case "qualidade_aprovada":
      return `Versão ${d.versao} aprovada no controle de qualidade${d.nota ? `: ${d.nota}` : ""}`;
    case "qualidade_reprovada":
      return `Versão ${d.versao} reprovada (${d.tipoErro}${d.cena ? ` · cena ${d.cena}` : ""}${d.minutagem ? ` · ${d.minutagem}` : ""}): ${d.texto}`;
    case "escalar":
      return `Limite de ${d.tentativas} reprovações internas: avaliar designer mais sênior`;
    case "cliente_aprovou":
      return `Cliente aprovou a versão ${d.versao}${d.primeira ? " de primeira" : ""}`;
    case "cliente_ajuste":
      return `Cliente pediu ajuste na versão ${d.versao} (rodada ${d.rodada}${Number(d.custo) > 0 ? `, ${d.custo} cr extras` : ""})`;
    case "cliente_rejeitou":
      return `Rejeição total da versão ${d.versao} (${d.motivo}): ${d.texto}`;
    case "cancelado":
      return `Pedido cancelado; ${d.devolvido} créditos devolvidos${d.integral ? "" : " (parcial)"}`;
    case "concluido_equipe":
    case "concluido_gerente": // nome antigo do evento
      return `Concluído pela equipe com a versão ${d.versao}: ${d.motivo}`;
    case "aprovacao_automatica":
      return `Versão ${d.versao} aprovada automaticamente (cliente sem resposta em ${d.dias} dias úteis)`;
    case "lembrete_aprovacao":
      return "Cliente lembrado: falta 1 dia útil para a aprovação automática";
    default:
      return e.tipo;
  }
}

export default async function PedidoEquipe({ params, searchParams }: PageProps<"/equipe/pedidos/[id]">) {
  const u = await exigirUsuario(EQUIPE);
  const { id } = await params;
  const confirmacao = mensagemDe((await searchParams).ok);
  let p: PedidoDetalhe;
  try {
    p = pedidoParaUsuario(Number(id), u);
  } catch (e) {
    if (e instanceof ErroNegocio) notFound();
    throw e;
  }
  const b = p.briefing;
  const arquivos = arquivosPorIds([...b.arquivos.logo, ...b.arquivos.manual, ...b.arquivos.fotos]);
  const marca = um<{ observacoes: string }>("SELECT observacoes FROM marcas WHERE usuario_id = ?", p.cliente_id);
  const pode = (a: Parameters<typeof podeExecutar>[0]) => podeExecutar(a, p.status as StatusPedido, u.papel);
  const ehResponsavel = u.papel === "admin" || p.designer_id === u.id;
  const ultima = p.versoes[0];
  const designers = pode("atribuir") ? listarDesigners() : [];
  const escalar = p.tentativas_internas >= LIMITE_TENTATIVAS && !["aprovado", "cancelado"].includes(p.status);
  const reprovacao = p.status === "producao" && ultima?.status === "reprovada" ? p.eventos.findLast((e) => e.tipo === "qualidade_reprovada") : undefined;
  const ajusteCliente = p.status === "ajustes" ? p.eventos.findLast((e) => e.tipo === "cliente_ajuste") : undefined;
  const rejeicao = p.status === "triagem" ? p.eventos.findLast((e) => e.tipo === "cliente_rejeitou") : undefined;

  const acoes: React.ReactNode[] = [];

  if (pode("atribuir"))
    acoes.push(
      <section className="card" key="atribuir">
        <h2>{p.designer_id ? "Reatribuir designer" : "Triagem: atribuir designer"}</h2>
        {rejeicao && (
          <p className="alerta alerta-erro" style={{ marginBottom: 12 }}>
            {descreverEvento(rejeicao)}. Converse com o cliente e ajuste o briefing antes de reatribuir.
          </p>
        )}
        <FormAcao action={atribuirAction}>
          <input type="hidden" name="pedido" value={p.id} />
          <div className="field">
            <label className="label" htmlFor="designer">
              Designer
            </label>
            <select id="designer" name="designer" className="txt" required defaultValue={p.designer_id ?? ""}>
              <option value="" disabled>
                Escolha
              </option>
              {designers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                  {d.senior ? " (sênior)" : ""} · {d.ativos} {d.ativos === 1 ? "pedido ativo" : "pedidos ativos"}
                </option>
              ))}
            </select>
            {escalar && <span className="hint">Este pedido já teve {p.tentativas_internas} reprovações internas. Prefira um designer sênior.</span>}
          </div>
          <Enviar>{p.designer_id ? "Reatribuir" : "Atribuir e iniciar produção"}</Enviar>
        </FormAcao>
      </section>,
    );

  if (pode("enviar_versao") && ehResponsavel)
    acoes.push(
      <section className="card" key="versao" style={{ borderColor: "var(--key)" }}>
        <h2>Enviar versão {(p.versoes.length || 0) + 1}</h2>
        {reprovacao && (
          <p className="alerta alerta-erro" style={{ marginBottom: 12 }}>
            {descreverEvento(reprovacao)}
          </p>
        )}
        {ajusteCliente && (
          <p className="alerta alerta-aviso" style={{ marginBottom: 12 }}>
            {descreverEvento(ajusteCliente)}. Veja os comentários do cliente no vídeo abaixo.
          </p>
        )}
        <EnviarVersao pedidoId={p.id} numero={(p.versoes.length || 0) + 1} />
      </section>,
    );

  if (pode("enviar_versao") && !ehResponsavel)
    acoes.push(
      <p className="alerta" key="outro-designer">
        Este pedido está com <b>{p.designer_nome}</b>. Só o designer responsável envia versões; para assumir, peça ao diretor de
        arte que reatribua o pedido.
      </p>,
    );

  if (pode("aprovar_qualidade"))
    acoes.push(
      <section className="card" key="qualidade" style={{ borderColor: "var(--key)" }}>
        <h2>Controle de qualidade da versão {ultima?.numero}</h2>
        <p className="muted small" style={{ marginBottom: 14 }}>
          Confira a versão abaixo contra o briefing. Aprovada, ela vai direto para o cliente.
        </p>
        <div className={styles.acoes}>
          <FormAcao action={aprovarQualidadeAction}>
            <input type="hidden" name="pedido" value={p.id} />
            <div className="field">
              <label className="label" htmlFor="nota-qa">
                Nota interna <span className="opt">(opcional)</span>
              </label>
              <input id="nota-qa" name="nota" className="txt" />
            </div>
            <Enviar>Aprovar e liberar para o cliente</Enviar>
          </FormAcao>
          <details className={styles.det}>
            <summary className="btn btn-danger">Reprovar com diagnóstico</summary>
            <FormAcao action={reprovarQualidadeAction}>
              <input type="hidden" name="pedido" value={p.id} />
              <div className="field">
                <label className="label" htmlFor="tipoErro">
                  Tipo de erro
                </label>
                <select id="tipoErro" name="tipoErro" className="txt" required defaultValue="">
                  <option value="" disabled>
                    Escolha
                  </option>
                  {TIPOS_ERRO.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div className="field" style={{ flex: "1 1 120px" }}>
                  <label className="label" htmlFor="cena">
                    Cena <span className="opt">(opcional)</span>
                  </label>
                  <input id="cena" name="cena" className="txt" placeholder="2" />
                </div>
                <div className="field" style={{ flex: "1 1 120px" }}>
                  <label className="label" htmlFor="minutagem">
                    Minutagem <span className="opt">(opcional)</span>
                  </label>
                  <input id="minutagem" name="minutagem" className="txt" placeholder="00:04 a 00:07" />
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="texto-qa">
                  O que corrigir
                </label>
                <textarea id="texto-qa" name="texto" className="txt" required />
                <span className="hint">
                  Só a parte com problema volta para o designer. Tentativa {p.tentativas_internas + 1} de {LIMITE_TENTATIVAS} antes
                  de escalar.
                </span>
              </div>
              <Enviar className="btn btn-danger">Devolver ao designer</Enviar>
            </FormAcao>
          </details>
        </div>
      </section>,
    );

  if (pode("concluir")) {
    const prazo = prazoAprovacaoAutomatica(p.id);
    acoes.push(
      <section className="card" key="concluir">
        <h2>Concluir pedido</h2>
        <p className="muted small" style={{ marginBottom: 12 }}>
          A versão {ultima?.numero} está com o cliente
          {prazo ? ` e será aprovada automaticamente em ${formatarData(paraSql(prazo))} se não houver resposta` : ""}. Conclua
          agora se o cliente aprovou por outro canal ou se a conversa já foi encerrada.
        </p>
        <FormAcao action={concluirAction} confirmar="Concluir o pedido com a versão atual como final?">
          <input type="hidden" name="pedido" value={p.id} />
          <div className="field">
            <label className="label" htmlFor="motivo-concluir">
              Motivo
            </label>
            <textarea
              id="motivo-concluir"
              name="motivo"
              className="txt"
              required
              minLength={5}
              placeholder="Ex.: cliente aprovou por WhatsApp em 10/10."
            />
            <span className="hint">Fica no histórico do pedido. Conclusões pela equipe não contam como aprovação de primeira.</span>
          </div>
          <Enviar>Concluir pedido</Enviar>
        </FormAcao>
      </section>,
    );
  }

  if (pode("cancelar"))
    acoes.push(
      <section className="card" key="cancelar">
        <h2>Cancelar pedido</h2>
        <FormAcao action={cancelarEquipeAction} confirmar="Cancelar este pedido e devolver créditos ao cliente?">
          <input type="hidden" name="pedido" value={p.id} />
          {p.versoes.length > 0 ? (
            <label className="check" style={{ marginBottom: 12 }}>
              <input type="checkbox" name="erroPlataforma" value="1" />
              <span>
                Erro da plataforma: devolver os {p.creditos} créditos inteiros (sem marcar, devolve metade, por mudança de ideia do
                cliente).
              </span>
            </label>
          ) : (
            <p className="muted small" style={{ marginBottom: 12 }}>
              Ainda sem produção: os {p.creditos} créditos voltam inteiros para o cliente.
            </p>
          )}
          <Enviar className="btn btn-danger">Cancelar pedido</Enviar>
        </FormAcao>
      </section>,
    );

  return (
    <>
      <Link href="/equipe/pedidos" className="link small">
        ← Pedidos
      </Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <h1>{p.titulo}</h1>
          <p className="row">
            <span className="tnum">{p.codigo}</span>
            <StatusBadge status={p.status} visao="equipe" />
            {p.urgente === 1 && <span className="tag">Urgente</span>}
            {escalar && <span className="tag">{p.tentativas_internas} reprovações internas</span>}
          </p>
        </div>
      </div>

      <Confirmacao texto={confirmacao} />

      <div className="card" style={{ marginBottom: 16 }}>
        <dl className="dl">
          <dt>Cliente</dt>
          <dd>
            {p.cliente_nome}
            {p.empresa ? ` · ${p.empresa}` : ""}
          </dd>
          <dt>Designer</dt>
          <dd>{p.designer_nome ?? "Ninguém ainda"}</dd>
          <dt>Entrega prevista</dt>
          <dd>{formatarData(p.entrega_prevista)}</dd>
          <dt>Ajustes do cliente</dt>
          <dd>
            {p.revisoes_usadas} de {p.revisoes_incluidas} rodadas incluídas
          </dd>
          <dt>Reprovações internas</dt>
          <dd>{p.tentativas_internas}</dd>
          <dt>Situação</dt>
          <dd>{STATUS[p.status].rotulo}</dd>
        </dl>
      </div>

      <div className={styles.layout}>
        <div className="stack">
          {acoes}
          <section className="card">
            <h2>Versões e comentários</h2>
            <VersaoPlayer
              pedidoId={p.id}
              versoes={p.versoes}
              comentarios={p.comentarios}
              equipe
              podeComentar={p.status !== "cancelado"}
              usuarioId={u.id}
            />
          </section>
        </div>
        <div className="stack">
          <section className="card">
            <h2>Briefing</h2>
            <BriefingResumo b={b} arquivos={arquivos} mostrarCreditos />
            {marca?.observacoes && (
              <p className="alerta" style={{ marginTop: 12 }}>
                <b>Observação da marca:</b> {marca.observacoes}
              </p>
            )}
          </section>
          <section className="card">
            <h2>Histórico</h2>
            <ul className={styles.historico}>
              {p.eventos.map((e) => (
                <li key={e.id}>
                  <span>{descreverEvento(e)}</span>
                  <small>
                    {formatarDataHora(e.criado_em)}
                    {e.autor_nome ? ` · ${e.autor_nome}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
