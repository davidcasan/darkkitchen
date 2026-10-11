import fs from "node:fs";
import { gerarIaCompAction } from "@/app/actions/admin";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { Markdown } from "@/components/Markdown";
import { formatarDataHora } from "@/server/datas";
import {
  ROTULO_STATUS,
  type Sugestoes,
  type TipoArquivoIaComp,
  arquivoDaVersao,
  arquivoDoJob,
  configIaComp,
  jobDoPedido,
  sugestoesDo,
  versoesDoJob,
} from "@/server/services/iaComp";

const seg = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const origemTexto = (origem: "ia" | "chat", modelo: string | null) =>
  origem === "chat" ? "Feita pelo Claude no chat (sem custo de API)" : modelo ? `Gerada pelo site (${modelo})` : "Gerada pelo site (sem IA)";

// Quadro da IA Comp no pedido (só equipe): sugestões da IA, kit do After e, no modo
// máquina operária, a composição e a prévia. Gerar de novo guarda a versão atual em
// "Versões anteriores".
export function IaCompPedido({ pedidoId, admin }: { pedidoId: number; admin: boolean }) {
  const job = jobDoPedido(pedidoId);
  const cfg = configIaComp();
  if (!job && !admin) return null;
  const s = job ? sugestoesDo(job) : null;
  const versoes = job ? versoesDoJob(job.id) : [];
  const andamento = job && ["pendente", "gerando", "aguardando_maquina", "na_maquina"].includes(job.status);

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>IA Comp</h2>
        {job && (
          <span className="badge" data-tom={job.status === "pronto" ? "ok" : job.status === "erro" ? "parado" : "andamento"}>
            {ROTULO_STATUS[job.status]}
          </span>
        )}
      </div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        Ponto de partida interno para o designer: sugestões e composição inicial no After. O cliente não vê.
        {job ? ` ${origemTexto(job.origem, job.modelo)} · atualizada em ${formatarDataHora(job.atualizado_em)}.` : ""}
        {andamento ? " Atualize a página em instantes." : ""}
      </p>
      {job?.nota && <p className="small" style={{ whiteSpace: "pre-line", marginBottom: 12 }}>{job.nota}</p>}
      {job?.erro && <p className={`alerta ${job.status === "erro" ? "alerta-erro" : "alerta-aviso"} small`}>{job.erro}</p>}

      {job && <Arquivos jobId={job.id} marca={job.atualizado_em} />}
      {job?.especificacao && <Especificacao texto={job.especificacao} />}
      {s && <QuadroSugestoes s={s} />}

      {job && versoes.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer" }}>
            <b>Versões anteriores ({versoes.length})</b>
          </summary>
          <div className="stack" style={{ gap: 12, marginTop: 12 }}>
            {versoes.map((v, i) => {
              const sv = sugestoesDo(v);
              return (
                <div key={v.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <p className="small" style={{ marginBottom: 8 }}>
                    <b>Versão {versoes.length - i}</b> · {origemTexto(v.origem, v.modelo)} · {formatarDataHora(v.criado_em)}
                  </p>
                  {v.nota && <p className="small muted" style={{ whiteSpace: "pre-line", marginBottom: 8 }}>{v.nota}</p>}
                  <Arquivos jobId={job.id} versao={v.id} marca={v.arquivado_em} pequena />
                  {v.especificacao && <Especificacao texto={v.especificacao} />}
                  {sv && (
                    <details>
                      <summary className="small" style={{ cursor: "pointer" }}>Ver sugestões desta versão</summary>
                      <div style={{ marginTop: 8 }}>
                        <QuadroSugestoes s={sv} />
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {admin && (
        <FormAcao
          action={gerarIaCompAction}
          confirmar={
            cfg.usarIA
              ? "Gerar agora? Usa créditos da API da Anthropic. A versão atual fica guardada em Versões anteriores."
              : "Gerar o kit agora (sem IA)? A versão atual fica guardada em Versões anteriores."
          }
        >
          <input type="hidden" name="pedido" value={pedidoId} />
          <div style={{ marginTop: 12 }}>
            <Enviar className="btn btn-sm" enviando="Colocando na fila...">
              {job ? "Gerar de novo" : "Gerar sugestões e kit"}
            </Enviar>
            <small className="muted" style={{ marginLeft: 10 }}>
              Modo atual: {cfg.modo === "operaria" ? "máquina operária" : "kit"} · IA {cfg.usarIA ? "ligada" : "desligada"}
            </small>
          </div>
        </FormAcao>
      )}
    </section>
  );
}

function Arquivos({ jobId, versao, marca, pequena }: { jobId: number; versao?: number; marca: string; pequena?: boolean }) {
  const caminho = (t: TipoArquivoIaComp) => (versao ? arquivoDaVersao(jobId, versao, t) : arquivoDoJob(jobId, t));
  const tem = (t: TipoArquivoIaComp) => fs.existsSync(caminho(t));
  const url = (t: TipoArquivoIaComp) =>
    `/api/v1/ia-comp/${jobId}/arquivo/${t}?${versao ? `versao=${versao}&` : ""}v=${encodeURIComponent(marca)}`;
  return (
    <>
      {(tem("kit") || tem("aep")) && (
        <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          {tem("aep") && (
            <a className={`btn btn-sm${versao ? "" : " btn-primary"}`} href={url("aep")}>
              Baixar composição (.aep + mídias, .zip)
            </a>
          )}
          {tem("kit") && (
            <a className="btn btn-sm" href={url("kit")}>
              Baixar kit do After (.zip)
            </a>
          )}
        </div>
      )}
      {tem("previa") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url("previa")}
          alt="Prévia da composição"
          style={{ maxWidth: pequena ? 240 : "100%", maxHeight: pequena ? 240 : 640, borderRadius: 12, marginBottom: 12, display: "block" }}
        />
      )}
    </>
  );
}

function Especificacao({ texto }: { texto: string }) {
  return (
    <details style={{ marginBottom: 12 }}>
      <summary style={{ cursor: "pointer" }}>
        <b>Especificação de produção (After)</b>
      </summary>
      <div className="small" style={{ marginTop: 8 }}>
        <Markdown texto={texto} />
      </div>
    </details>
  );
}

function QuadroSugestoes({ s }: { s: Sugestoes }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div>
        <span className="label">Conceito</span>
        <p>{s.conceito}</p>
      </div>
      {s.linhas_criativas.length > 0 && (
        <div>
          <span className="label">Linhas criativas</span>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {s.linhas_criativas.map((l, i) => (
              <li key={i}>
                <b>{l.titulo}</b>: {l.descricao}
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.cenas.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <span className="label">Cenas</span>
          <table className="extrato">
            <thead>
              <tr>
                <th>Tempo</th>
                <th>Texto na tela</th>
                <th>Locução</th>
                <th>Visual</th>
              </tr>
            </thead>
            <tbody>
              {s.cenas.map((c, i) => (
                <tr key={i}>
                  <td className="tnum">
                    {seg(c.inicio)}–{seg(c.fim)}
                  </td>
                  <td>{c.texto_tela}</td>
                  <td>{c.locucao || "—"}</td>
                  <td className="small">{c.visual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s.paleta.length > 0 && (
        <div>
          <span className="label">Paleta</span>
          <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
            {s.paleta.map((p, i) => (
              <span key={i} className="row small" style={{ gap: 6 }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: p.hex, border: "1px solid var(--line)", display: "inline-block" }} />
                {p.hex} · {p.uso}
              </span>
            ))}
          </div>
        </div>
      )}
      <dl className="dl">
        <dt>Tipografia</dt>
        <dd>{s.tipografia}</dd>
        <dt>Ritmo</dt>
        <dd>{s.ritmo}</dd>
        <dt>Trilha</dt>
        <dd>{s.trilha}</dd>
        <dt>Observações</dt>
        <dd>{s.observacoes}</dd>
      </dl>
    </div>
  );
}
