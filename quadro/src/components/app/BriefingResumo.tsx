import { type Briefing, LOCUCAO, calcularCreditos, contarPalavras, limitePalavras, pecaDo } from "@/domain/briefing";
import type { Arquivo } from "@/server/services/arquivos";
import { formatarTamanho, urlArquivo } from "./upload";
import styles from "./BriefingResumo.module.css";

type Linha = [string, React.ReactNode];

function Secao({ titulo, linhas }: { titulo: string; linhas: Linha[] }) {
  const visiveis = linhas.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false);
  if (!visiveis.length) return null;
  return (
    <section className={styles.secao}>
      <h3>{titulo}</h3>
      <dl className="dl">
        {visiveis.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ListaArquivos({ ids, arquivos }: { ids: number[]; arquivos: Map<number, Arquivo> }) {
  const itens = ids.map((id) => arquivos.get(id)).filter(Boolean) as Arquivo[];
  if (!itens.length) return null;
  return (
    <span className="arquivos">
      {itens.map((a) => (
        <a key={a.id} className="arquivo" href={urlArquivo(a.id, true)}>
          <span>{a.nome}</span>
          <small className="muted">{formatarTamanho(a.tamanho)}</small>
        </a>
      ))}
    </span>
  );
}

/** Relatório do briefing, organizado por etapa. A equipe trabalha a partir dele. */
export function BriefingResumo({
  b,
  arquivos,
  marcaNome,
  mostrarCreditos,
}: {
  b: Briefing;
  arquivos: Arquivo[];
  marcaNome?: string | null;
  mostrarCreditos?: boolean;
}) {
  const logo = b.tipo === "logo";
  const mapa = new Map(arquivos.map((a) => [a.id, a]));
  const cenas = b.cenas.filter((c) => c.trim());
  const palavras = cenas.reduce((s, c) => s + contarPalavras(c), 0);
  const limite = limitePalavras(b);
  const { linhas } = calcularCreditos(b);

  return (
    <div className={styles.wrap}>
      <Secao
        titulo="Peça"
        linhas={[
          ["Tipo", pecaDo(b)?.nome],
          ["Duração", b.duracao ? `${b.duracao} segundos` : null],
          ["Proporções", b.formatos.join(", ")],
          ["Áudio", b.audio],
          ["Legendas", logo ? null : b.legendas],
          ["Arquivo aberto", b.aberto ? "Sim (.aep)" : "Não"],
          ["Prazo", b.prazo === "urgente" ? "Urgente" : "Padrão"],
        ]}
      />
      <Secao
        titulo="Contexto"
        linhas={
          logo
            ? [["Usos da vinheta", b.uso.join(", ")]]
            : [
                ["Objetivo", b.objetivo],
                ["Público", b.publico],
                ["Onde publica", b.plataformas.join(", ")],
                ["Chamada para ação", b.cta],
              ]
        }
      />
      <Secao
        titulo="Conteúdo"
        linhas={
          logo
            ? [
                ["Revelação", b.revelacao],
                ["Slogan", b.slogan],
              ]
            : [
                b.semRoteiro
                  ? ["Roteiro", <span key="r">A criar pela equipe. Ideia: {b.ideia}</span>]
                  : [
                      "Roteiro",
                      <span key="r">
                        <ol className={styles.cenas}>
                          {cenas.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ol>
                        <small className={palavras > limite ? styles.alerta : "muted"}>
                          {palavras} de {limite} palavras recomendadas
                        </small>
                      </span>,
                    ],
                ["Locução", b.audio === LOCUCAO ? `${b.voz ?? ""}: ${b.locucao}` : null],
                ["Obrigatório", b.obrig],
              ]
        }
      />
      <Secao
        titulo="Marca"
        linhas={[
          ["Marca", marcaNome],
          ["Logo", <ListaArquivos key="l" ids={b.arquivos.logo} arquivos={mapa} />],
          ["Manual e fontes", b.arquivos.manual.length ? <ListaArquivos key="m" ids={b.arquivos.manual} arquivos={mapa} /> : null],
          ["Fotos", b.arquivos.fotos.length ? <ListaArquivos key="f" ids={b.arquivos.fotos} arquivos={mapa} /> : null],
          [
            "Cores",
            <span key="c" className="row">
              {b.cores.map((c) => (
                <span key={c} className="row small">
                  <span className="swatch" style={{ background: c }} />
                  {c.toUpperCase()}
                </span>
              ))}
            </span>,
          ],
          ["Visual", b.visual === "especial" ? "Visual especial de campanha" : "Seguir o padrão da marca"],
        ]}
      />
      <Secao
        titulo="Estilo"
        linhas={[
          ["Animação", b.estilo.join(", ")],
          ["Tom", b.tom],
          [
            "Referências",
            b.refs.some((r) => r.url) ? (
              <ul className={styles.refs}>
                {b.refs
                  .filter((r) => r.url)
                  .map((r, i) => (
                    <li key={i}>
                      {/^https?:\/\//i.test(r.url) ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer nofollow">
                          {r.url}
                        </a>
                      ) : (
                        r.url
                      )}
                      {r.gosta && <span className="muted"> · {r.gosta}</span>}
                    </li>
                  ))}
              </ul>
            ) : null,
          ],
          ["Evitar", b.evitar],
        ]}
      />
      <Secao
        titulo="Aprovação"
        linhas={[
          ["Quem aprova", b.aprovador],
          ["E-mail", b.email],
        ]}
      />
      {mostrarCreditos && (
        <Secao titulo="Créditos" linhas={linhas.map((l) => [l.descricao, `${l.creditos} cr`] as Linha)} />
      )}
    </div>
  );
}
