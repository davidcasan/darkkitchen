import type { Metadata } from "next";
import Link from "next/link";
import { PainelAtendimento } from "@/components/app/Atendimento";
import { exigirUsuario } from "@/server/auth";
import { ErroNegocio } from "@/server/db";
import { formatarDataHora } from "@/server/datas";
import { abrirConversa, listarConversas } from "@/server/services/atendimento";
import styles from "./atendimento.module.css";

export const metadata: Metadata = { title: "Atendimento" };

const numero = (v: unknown) => (typeof v === "string" && Number(v) > 0 ? Number(v) : null);

export default async function AtendimentoAdmin({ searchParams }: PageProps<"/equipe/atendimento">) {
  const u = await exigirUsuario(["admin"]);
  const q = await searchParams;
  const pedidoId = numero(q.pedido);
  const clienteId = numero(q.cliente);
  const conversas = listarConversas(u);

  let aberta: ReturnType<typeof abrirConversa> | null = null;
  let erro: string | null = null;
  if (pedidoId || clienteId) {
    try {
      aberta = abrirConversa(u, { pedidoId, clienteId });
    } catch (e) {
      if (!(e instanceof ErroNegocio)) throw e;
      erro = e.message;
    }
  }
  const linkDe = (c: { pedido_id: number | null; cliente_id: number }) =>
    c.pedido_id ? `/equipe/atendimento?pedido=${c.pedido_id}` : `/equipe/atendimento?cliente=${c.cliente_id}`;
  const ehAberta = (c: { pedido_id: number | null; cliente_id: number }) =>
    !!aberta && aberta.clienteId === c.cliente_id && aberta.pedidoId === c.pedido_id;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Atendimento</h1>
          <p>Conversas com os clientes, uma por pedido e uma geral por cliente. Nada pode ser apagado.</p>
        </div>
      </div>

      <div className={styles.layout} data-aberta={!!aberta}>
        <section className={`card ${styles.lista}`} aria-label="Conversas">
          {conversas.length === 0 ? (
            <p className="muted small">
              Nenhuma conversa ainda. Para iniciar, abra um pedido e use &quot;Atendimento com o cliente&quot;, ou abra a conta do
              cliente em Contas e use &quot;Atendimento&quot;.
            </p>
          ) : (
            <ul>
              {conversas.map((c) => (
                <li key={`${c.cliente_id}-${c.pedido_id ?? 0}`}>
                  <Link href={linkDe(c)} className={styles.item} aria-current={ehAberta(c) ? "page" : undefined}>
                    <span className={styles.topo}>
                      <b>{c.cliente_nome}</b>
                      {c.nao_lidas > 0 && !ehAberta(c) && <span className={styles.selo}>{c.nao_lidas}</span>}
                    </span>
                    <small className={styles.assunto}>
                      {c.pedido_codigo ? `${c.pedido_codigo} · ${c.pedido_titulo}` : "Atendimento geral"}
                      {c.empresa ? ` · ${c.empresa}` : ""}
                    </small>
                    <small className={styles.previa}>
                      {c.ultima_da_equipe ? "Você: " : ""}
                      {c.ultima_texto}
                    </small>
                    <small className={styles.quando}>{formatarDataHora(c.ultima_em)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className={styles.conversa}>
          {aberta ? (
            <>
              <p className={styles.voltar}>
                <Link href="/equipe/atendimento">← Todas as conversas</Link>
              </p>
              <p className="small muted" style={{ marginBottom: 8 }}>
                Cliente: <b>{aberta.cliente_nome}</b>
                {aberta.pedidoId && (
                  <>
                    {" · "}
                    <Link href={`/equipe/pedidos/${aberta.pedidoId}`}>Abrir o pedido</Link>
                  </>
                )}
                {" · "}
                <Link href={`/equipe/contas/${aberta.clienteId}`}>Conta do cliente</Link>
              </p>
              <PainelAtendimento
                key={`${aberta.clienteId}-${aberta.pedidoId ?? 0}`}
                alvo={{ pedidoId: aberta.pedidoId, clienteId: aberta.pedidoId ? null : aberta.clienteId }}
                visao="admin"
                titulo={aberta.cliente_nome}
                embutido
              />
            </>
          ) : (
            <div className={`card ${styles.nenhuma}`}>
              <p className="muted">{erro ?? "Escolha uma conversa ao lado."}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
