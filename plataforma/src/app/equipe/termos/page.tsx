import type { Metadata } from "next";
import Link from "next/link";
import { salvarTermosAction } from "@/app/actions/admin";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { exigirUsuario } from "@/server/auth";
import { formatarDataHora } from "@/server/datas";
import { aceitesPorVersao, historicoTermos, termosAtuais } from "@/server/services/termos";

export const metadata: Metadata = { title: "Termos de uso" };

export default async function TermosAdmin() {
  await exigirUsuario(["admin"]);
  const t = termosAtuais();
  const historico = historicoTermos();
  const aceites = aceitesPorVersao();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Termos de uso</h1>
          <p>
            Texto que o cliente aceita ao criar a conta, publicado em <Link href="/termos">/termos</Link>. Versão em vigor:{" "}
            <b>{t.versao}</b>
            {t.atualizado_em ? ` (desde ${formatarDataHora(t.atualizado_em)})` : " (texto padrão, ainda não editado)"}.
          </p>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Editar texto</h2>
        <p className="muted small" style={{ marginBottom: 12 }}>
          Formatação: <code>## Título</code>, <code>**negrito**</code>, listas com <code>-</code> ou <code>1.</code>, tabelas com{" "}
          <code>|</code> e links como <code>[texto](https://...)</code>. Ao salvar, vira a versão {t.versao + 1}: os novos cadastros
          aceitam a versão nova, e o aceite de quem já é cliente continua registrado na versão que aceitou. Mudanças relevantes
          precisam ser avisadas aos clientes com antecedência (seção 15 dos termos).
        </p>
        <FormAcao action={salvarTermosAction} confirmar={`Publicar a versão ${t.versao + 1} dos Termos de Uso?`}>
          <textarea
            name="texto"
            className="txt"
            defaultValue={t.texto}
            rows={28}
            style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 13, lineHeight: 1.5 }}
            required
          />
          <div className="row" style={{ marginTop: 12 }}>
            <Enviar enviando="Publicando...">Salvar e publicar nova versão</Enviar>
            <Link href="/termos" className="btn" target="_blank">
              Ver no site
            </Link>
          </div>
        </FormAcao>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Aceites por versão</h2>
          {aceites.length === 0 ? (
            <p className="muted small">Nenhum aceite ainda.</p>
          ) : (
            <ul className="lista">
              {aceites.map((a) => (
                <li key={a.versao} className="row-between" style={{ padding: "8px 0" }}>
                  <span>Versão {a.versao}</span>
                  <b>
                    {a.n} {a.n === 1 ? "cliente" : "clientes"}
                  </b>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>Histórico</h2>
          {historico.length === 0 ? (
            <p className="muted small">Nenhuma alteração ainda: o site mostra o texto padrão (versão 1).</p>
          ) : (
            <ul className="lista">
              {historico.map((h) => (
                <li key={h.id} style={{ padding: "8px 0" }}>
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
      </div>
    </>
  );
}
