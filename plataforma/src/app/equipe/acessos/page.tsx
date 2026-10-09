import type { Metadata } from "next";
import { GraficoBarras } from "@/components/app/GraficoBarras";
import { PAPEIS } from "@/domain/pedido";
import { exigirUsuario } from "@/server/auth";
import { formatarDataHora } from "@/server/datas";
import { resumoAcessos } from "@/server/services/acessos";

export const metadata: Metadata = { title: "Acessos" };

const numero = (n: number) => n.toLocaleString("pt-BR");
const ORIGEM: Record<string, string> = { site: "Site", cadastro: "Cadastro", app: "App" };
const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;
const desdeQuando = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const diaLongo = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });

export default async function Acessos() {
  await exigirUsuario(["admin"]);
  const r = resumoAcessos();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Acessos</h1>
          <p>
            Visitas ao site e à área do cliente, e logins na plataforma.
            {r.total.desde ? ` Contando desde ${desdeQuando(r.total.desde)}.` : " A contagem começa agora."}
          </p>
        </div>
      </div>

      <div className="grid-kpi" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <span>Visitantes hoje</span>
          <b>{numero(r.hoje.unicos)}</b>
          <small>{plural(r.hoje.paginas, "página vista", "páginas vistas")}</small>
        </div>
        <div className="kpi">
          <span>Últimos 7 dias</span>
          <b>{numero(r.semana.unicos)}</b>
          <small>{plural(r.semana.paginas, "página vista", "páginas vistas")}</small>
        </div>
        <div className="kpi">
          <span>Últimos 30 dias</span>
          <b>{numero(r.mes.unicos)}</b>
          <small>
            Site {numero(r.mesSite.unicos)} · Área do cliente {numero(r.mesCliente.unicos)}
          </small>
        </div>
        <div className="kpi">
          <span>Logins hoje</span>
          <b>{numero(r.loginsHoje.n)}</b>
          <small>
            {numero(r.loginsMes.n)} em 30 dias, {plural(r.loginsMes.pessoas, "pessoa", "pessoas")}
          </small>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Visitantes por dia (últimos 30 dias)</h2>
        <GraficoBarras
          rotuloAcessivel="Visitantes únicos por dia nos últimos 30 dias"
          formatar={(v) => `${numero(v)} ${v === 1 ? "visitante" : "visitantes"}`}
          dados={r.serie.map((d, i) => ({
            rotulo: (r.serie.length - 1 - i) % 3 === 0 ? d.dia.slice(8, 10) : "",
            detalhe: `${diaLongo(d.dia)} · ${plural(d.paginas, "página", "páginas")}`,
            valor: d.unicos,
          }))}
        />
        <p className="muted small" style={{ marginTop: 10 }}>
          Visitante = um navegador num dia. Para proteger a privacidade, ninguém é identificado: quem volta em outro dia conta de
          novo. Robôs e a área da equipe não entram na conta.
        </p>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Páginas mais vistas (30 dias)</h2>
          {r.paginas.length === 0 ? (
            <p className="muted small">Nenhuma visita registrada ainda.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="extrato">
                <tbody>
                  {r.paginas.map((p) => (
                    <tr key={p.rotulo}>
                      <td>{p.rotulo}</td>
                      <td className="num">
                        {numero(p.n)}
                        <br />
                        <small className="muted">{plural(p.unicos, "visitante", "visitantes")}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Logins (30 dias)</h2>
          {r.loginsPorPapel.length === 0 ? (
            <p className="muted small">Nenhum login registrado ainda.</p>
          ) : (
            <dl className="dl" style={{ marginBottom: 16 }}>
              {r.loginsPorPapel.map((l) => (
                <div key={l.papel} style={{ display: "contents" }}>
                  <dt>{PAPEIS[l.papel] ?? l.papel}</dt>
                  <dd className="tnum">
                    {plural(l.n, "login", "logins")} · {plural(l.pessoas, "pessoa", "pessoas")}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {r.ultimosLogins.length > 0 && (
            <>
              <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Últimos logins</h3>
              <div style={{ overflowX: "auto" }}>
                <table className="extrato">
                  <tbody>
                    {r.ultimosLogins.map((l, i) => (
                      <tr key={i}>
                        <td>
                          {l.nome}
                          <br />
                          <small className="muted">
                            {PAPEIS[l.papel] ?? l.papel} · {ORIGEM[l.origem] ?? l.origem}
                          </small>
                        </td>
                        <td className="muted" style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                          {formatarDataHora(l.criado_em)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
