"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { criarMarcaNoBriefingAction, criarPedidoAction } from "@/app/actions/cliente";
import { PECAS } from "@/domain/catalogo";
import {
  type Briefing,
  ETAPAS,
  LOCUCAO,
  OPCOES,
  briefingVazio,
  calcularCreditos,
  contarPalavras,
  diasUteisDo,
  errosDaEtapa,
  limitePalavras,
  opcoesAudio,
  pecaDo,
} from "@/domain/briefing";
import { enviarArquivo } from "@/components/app/upload";
import styles from "./Wizard.module.css";

export interface ArquivoMarca {
  id: number;
  nome: string;
  categoria: "logo" | "manual";
}

const CHAVE_RASCUNHO = "quadro:rascunho-briefing";

// Desenho de cada tipo de peça no cartão da etapa 1 (barras do "glifo").
const GLIFOS: Record<string, [number, number][]> = {
  post: [[10, 30], [10, 18], [10, 26]],
  curto: [[6, 30], [6, 22], [6, 34], [6, 16], [6, 28]],
  explicativo: [[26, 26], [6, 6], [26, 26], [6, 6], [26, 26]],
  logo: [[14, 14], [22, 22], [30, 30]],
};

// ---------- Peças de interface (fora do componente para não perder o foco ao digitar) ----------

const ErrosCtx = createContext<string[]>([]);

function Campo({
  id,
  label,
  opcional,
  hint,
  erro,
  children,
}: {
  id: string;
  label?: string;
  opcional?: boolean;
  hint?: React.ReactNode;
  erro?: string;
  children: React.ReactNode;
}) {
  const erros = useContext(ErrosCtx);
  return (
    <div className={`field ${erros.includes(id) ? "bad" : ""}`} id={`f-${id}`}>
      {label && (
        <span className="label">
          {label} {opcional && <span className="opt">(opcional)</span>}
        </span>
      )}
      {children}
      {hint && <div className="hint">{hint}</div>}
      <div className="err">{erro ?? "Preencha este campo para continuar."}</div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
  extra,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  extra?: string;
}) {
  return (
    <button type="button" className="chip" aria-pressed={on} onClick={onClick}>
      {children}
      {extra && <small>{extra}</small>}
    </button>
  );
}

function ArquivosMarca({
  itens,
  selecionados,
  onAlternar,
}: {
  itens: ArquivoMarca[];
  selecionados: number[];
  onAlternar: (id: number) => void;
}) {
  if (!itens.length) return null;
  return (
    <div className="chips" style={{ marginBottom: 8 }}>
      {itens.map((a) => (
        <Chip key={a.id} on={selecionados.includes(a.id)} onClick={() => onAlternar(a.id)}>
          {a.nome}
        </Chip>
      ))}
    </div>
  );
}

function Upload({
  categoria,
  titulo,
  sub,
  accept,
  multiplo,
  enviando,
  onArquivos,
}: {
  categoria: "logo" | "manual" | "foto";
  titulo: string;
  sub: string;
  accept?: string;
  multiplo?: boolean;
  enviando: string | null;
  onArquivos: (lista: FileList | null, categoria: "logo" | "manual" | "foto") => void;
}) {
  return (
    <label className="drop">
      <span className="ic" aria-hidden="true">
        ↑
      </span>
      <span>
        <b>{enviando === categoria ? "Enviando..." : titulo}</b>
        <br />
        <span className="opt">{sub}</span>
      </span>
      <input
        type="file"
        accept={accept}
        multiple={multiplo}
        disabled={enviando !== null}
        onChange={(e) => {
          onArquivos(e.target.files, categoria);
          e.target.value = "";
        }}
      />
    </label>
  );
}

// Leitura do rascunho salvo, no formato que o useSyncExternalStore espera.
const assinarStorage = (avisar: () => void) => {
  window.addEventListener("storage", avisar);
  return () => window.removeEventListener("storage", avisar);
};

const lerRascunho = () => {
  try {
    const salvo = localStorage.getItem(CHAVE_RASCUNHO);
    return salvo && (JSON.parse(salvo) as { b?: Briefing })?.b?.tipo ? salvo : null;
  } catch {
    return null;
  }
};

const PLACEHOLDER_CENAS = [
  "Texto: Coleção Verão 2026",
  "Três fotos de looks com transição rápida",
  "Texto: Até 30% off",
  "Logo e link na bio",
];

export interface MarcaWizard {
  id: number;
  nome: string;
  cores: string[];
  arquivos: ArquivoMarca[];
}

/** Aplica a marca ao briefing: logo mais recente selecionado e cores da marca. */
function comMarca(b: Briefing, m: MarcaWizard): Briefing {
  const logos = m.arquivos.filter((a) => a.categoria === "logo");
  return {
    ...b,
    marcaId: m.id,
    arquivos: { ...b.arquivos, logo: logos.length ? [logos[0].id] : [], manual: [] },
    cores: m.cores.length ? m.cores : briefingVazio().cores,
    visual: b.visual ?? (logos.length ? "padrao" : null),
  };
}

export function Wizard({
  saldo,
  marcas: marcasIniciais,
  aprovador,
  email,
}: {
  saldo: number;
  marcas: MarcaWizard[];
  aprovador: string;
  email: string;
}) {
  const router = useRouter();
  const inicial = useMemo<Briefing>(() => {
    const b = { ...briefingVazio(), aprovador, email };
    // Com uma só marca, ela já vem escolhida (o cliente ainda pode trocar ou criar outra).
    return marcasIniciais.length === 1 ? comMarca(b, marcasIniciais[0]) : b;
  }, [marcasIniciais, aprovador, email]);

  const [b, setB] = useState<Briefing>(inicial);
  const [etapa, setEtapa] = useState(0);
  const [max, setMax] = useState(0);
  const [erros, setErros] = useState<string[]>([]);
  const [nomes, setNomes] = useState<Record<number, string>>(() =>
    Object.fromEntries(marcasIniciais.flatMap((m) => m.arquivos.map((a) => [a.id, a.nome]))),
  );
  const [marcas, setMarcas] = useState<MarcaWizard[]>(marcasIniciais);
  const [novaMarca, setNovaMarca] = useState<string | null>(null); // null = não está criando
  const [criandoMarca, setCriandoMarca] = useState(false);
  const marcaAtual = marcas.find((m) => m.id === b.marcaId);
  const [enviandoArquivo, setEnviandoArquivo] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [descartado, setDescartado] = useState(false);
  const painel = useRef<HTMLElement>(null);

  // Rascunho local: oferecido ao abrir (só no navegador) e salvo a cada mudança.
  const rascunho = useSyncExternalStore(assinarStorage, lerRascunho, () => null);

  const continuarRascunho = () => {
    try {
      const r = JSON.parse(rascunho ?? "") as { b: Briefing; etapa: number; max: number; nomes: Record<number, string> };
      setB({ ...inicial, ...r.b });
      setEtapa(Math.min(r.etapa ?? 0, 7));
      setMax(Math.min(r.max ?? 0, 7));
      setNomes((n) => ({ ...r.nomes, ...n }));
    } catch {
      setDescartado(true);
    }
  };

  useEffect(() => {
    if (!b.tipo) return;
    try {
      localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ b, etapa, max, nomes }));
    } catch {
      /* ignora */
    }
  }, [b, etapa, max, nomes]);

  const peca = pecaDo(b);
  const logo = b.tipo === "logo";
  const { linhas, total } = calcularCreditos(b);
  const dias = diasUteisDo(b);
  const falta = total - saldo;

  const set = <K extends keyof Briefing>(k: K, v: Briefing[K]) => {
    setB((x) => ({ ...x, [k]: v }));
    setErros((e) => e.filter((x) => x !== k));
  };
  const alternar = (k: "plataformas" | "uso" | "formatos" | "estilo", v: string) => {
    setB((x) => {
      const atual = x[k];
      let novo = atual.includes(v) ? atual.filter((y) => y !== v) : [...atual, v];
      if (k === "estilo" && novo.length > 2) novo = novo.slice(-2);
      return { ...x, [k]: novo };
    });
    setErros((e) => e.filter((x) => x !== k));
  };

  const escolherTipo = (t: Briefing["tipo"]) => {
    if (t === b.tipo) return;
    setB((x) => ({ ...x, tipo: t, duracao: null, audio: null, legendas: null, voz: null }));
    setMax(0);
    setErros([]);
  };

  const irPara = (n: number) => {
    setEtapa(n);
    setMax((m) => Math.max(m, n));
    setErros([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const continuar = async () => {
    if (etapa < 7) {
      const e = errosDaEtapa(b, etapa);
      setErros(e);
      if (e.length) {
        painel.current?.querySelector(`#f-${e[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      irPara(etapa + 1);
      return;
    }
    setEnviando(true);
    setErroGeral(null);
    const r = await criarPedidoAction(b);
    if (r?.erro || !r?.id) {
      setErroGeral(r?.erro ?? "Não foi possível enviar o pedido.");
      setEnviando(false);
      return;
    }
    try {
      localStorage.removeItem(CHAVE_RASCUNHO);
    } catch {
      /* ignora */
    }
    router.push(`/cliente/pedidos/${r.id}?novo=1`);
  };

  const descartarRascunho = () => {
    try {
      localStorage.removeItem(CHAVE_RASCUNHO);
    } catch {
      /* ignora */
    }
    setDescartado(true);
  };

  const escolherMarca = (m: MarcaWizard) => {
    setB((x) => comMarca(x, m));
    setNovaMarca(null);
    setErros((e) => e.filter((x) => !["marca", "logo"].includes(x)));
  };

  async function criarNovaMarca() {
    const nome = (novaMarca ?? "").trim();
    if (nome.length < 2) return setErroGeral("Dê um nome para a nova marca.");
    setCriandoMarca(true);
    setErroGeral(null);
    const r = await criarMarcaNoBriefingAction(nome);
    setCriandoMarca(false);
    if (r?.erro || !r?.id) return setErroGeral(r?.erro ?? "Não foi possível criar a marca.");
    const nova: MarcaWizard = { id: r.id, nome, cores: [], arquivos: [] };
    setMarcas((ms) => [...ms, nova]);
    escolherMarca(nova);
  }

  async function subir(lista: FileList | null, categoria: "logo" | "manual" | "foto") {
    if (!lista?.length) return;
    const marcaId = b.marcaId;
    if (categoria !== "foto" && !marcaId) return setErroGeral("Escolha a marca antes de enviar o logo ou o manual.");
    setEnviandoArquivo(categoria);
    setErroGeral(null);
    try {
      for (const f of Array.from(lista)) {
        const a = await enviarArquivo(f, categoria, categoria === "foto" ? null : marcaId);
        setNomes((n) => ({ ...n, [a.id]: a.nome }));
        const chave = categoria === "foto" ? "fotos" : categoria;
        setB((x) => ({ ...x, arquivos: { ...x.arquivos, [chave]: [...x.arquivos[chave], a.id] } }));
        // Logo e manual passam a fazer parte da marca, para os próximos pedidos.
        if (categoria !== "foto")
          setMarcas((ms) =>
            ms.map((m) => (m.id === marcaId ? { ...m, arquivos: [{ id: a.id, nome: a.nome, categoria }, ...m.arquivos] } : m)),
          );
        setErros((e) => e.filter((x) => x !== categoria));
      }
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : "Falha no envio do arquivo.");
    } finally {
      setEnviandoArquivo(null);
    }
  }

  const alternarArquivo = (chave: "logo" | "manual" | "fotos", id: number) => {
    setB((x) => {
      const atual = x.arquivos[chave];
      return {
        ...x,
        arquivos: { ...x.arquivos, [chave]: atual.includes(id) ? atual.filter((y) => y !== id) : [...atual, id] },
      };
    });
    setErros((e) => e.filter((x) => x !== chave));
  };

  const upload = { enviando: enviandoArquivo, onArquivos: subir };
  const doPerfil = (categoria: "logo" | "manual") => ({
    itens: (marcaAtual?.arquivos ?? []).filter((a) => a.categoria === categoria),
    selecionados: b.arquivos[categoria],
    onAlternar: (id: number) => alternarArquivo(categoria, id),
  });

  // ---------- Etapas ----------

  const cabecalhos: [string, string][] = [
    [
      "Que tipo de peça você precisa?",
      "Cada formato já vem com duração, prazo e número de revisões definidos. Você pode mudar depois, antes de enviar.",
    ],
    ["Para que serve essa peça?", "Saber o objetivo e quem vai assistir muda as decisões de ritmo, texto e enquadramento."],
    ["Formato, duração e som", "Essas escolhas definem o arquivo final. O primeiro formato está incluso."],
    logo
      ? ["Como o logo deve aparecer", "Escolha o tipo de revelação. O designer adapta ao desenho do seu logo."]
      : ["O que aparece no vídeo", "Descreva cena por cena. Quanto mais claro, menos ajustes depois."],
    [
      "Identidade da marca",
      "Escolha a marca deste pedido. Logo, manual e cores ficam salvos nela e vêm prontos nos próximos pedidos.",
    ],
    ["Estilo e referências", "Uma boa referência vale mais que qualquer descrição. Diga sempre o que você gosta nela."],
    ["Prazo e aprovação", "O prazo começa a contar quando o pedido é enviado com tudo preenchido."],
    ["Confira antes de enviar", "Revise cada parte. Depois de enviado, mudanças contam como revisão."],
  ];

  function renderEtapa() {
    switch (etapa) {
      case 0:
        return (
          <Campo id="tipo" erro="Escolha um tipo de peça.">
            <div className={styles.types}>
              {PECAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={styles.type}
                  aria-pressed={b.tipo === p.id}
                  onClick={() => escolherTipo(p.id)}
                >
                  <div className={styles.glyph} aria-hidden="true">
                    {GLIFOS[p.id].map(([w, h], i) => (
                      <em key={i} style={{ width: w, height: h }} />
                    ))}
                  </div>
                  <b>{p.nome}</b>
                  <span className="muted small">{p.descricao}</span>
                  <span className={styles.meta}>
                    <span>
                      até {p.duracoes[p.duracoes.length - 1]}s · {p.diasUteis} dias úteis
                    </span>
                    <span className={styles.cr}>{p.creditos} créditos</span>
                  </span>
                </button>
              ))}
            </div>
          </Campo>
        );

      case 1:
        return (
          <>
            <Campo id="nome" label="Nome do pedido" opcional hint="Para você achar fácil depois. Ex.: Promo Dia das Mães.">
              <input className="txt" value={b.nome} maxLength={80} onChange={(e) => set("nome", e.target.value)} />
            </Campo>
            {logo ? (
              <Campo id="uso" label="Onde a vinheta vai aparecer" hint="Marque todos os usos previstos." erro="Marque pelo menos um uso.">
                <div className="chips">
                  {OPCOES.usosLogo.map((o) => (
                    <Chip key={o} on={b.uso.includes(o)} onClick={() => alternar("uso", o)}>
                      {o}
                    </Chip>
                  ))}
                </div>
              </Campo>
            ) : (
              <>
                <Campo id="objetivo" label="Objetivo principal" erro="Escolha um objetivo.">
                  <div className="chips">
                    {OPCOES.objetivos.map((o) => (
                      <Chip key={o} on={b.objetivo === o} onClick={() => set("objetivo", o)}>
                        {o}
                      </Chip>
                    ))}
                  </div>
                </Campo>
                <Campo id="publico" label="Quem vai assistir" hint="Idade, perfil e o que essa pessoa já sabe sobre o produto.">
                  <input
                    className="txt"
                    value={b.publico}
                    placeholder="Mulheres de 25 a 40 anos que já seguem a marca"
                    onChange={(e) => set("publico", e.target.value)}
                  />
                </Campo>
                <Campo id="plataformas" label="Onde vai ser publicado" hint="Pode marcar mais de um." erro="Marque pelo menos um lugar.">
                  <div className="chips">
                    {OPCOES.plataformas.map((o) => (
                      <Chip key={o} on={b.plataformas.includes(o)} onClick={() => alternar("plataformas", o)}>
                        {o}
                      </Chip>
                    ))}
                  </div>
                </Campo>
                <Campo id="cta" label="O que a pessoa deve fazer depois" opcional hint="A chamada para ação que aparece no fim.">
                  <input className="txt" value={b.cta} placeholder="Comprar pelo link na bio" onChange={(e) => set("cta", e.target.value)} />
                </Campo>
              </>
            )}
          </>
        );

      case 2:
        return (
          <>
            <Campo
              id="formatos"
              label="Proporções"
              hint="Cada formato além do primeiro adiciona 2 créditos."
              erro="Escolha pelo menos uma proporção."
            >
              <div className="chips">
                {OPCOES.formatos.map(([v, l]) => (
                  <Chip
                    key={v}
                    on={b.formatos.includes(v)}
                    onClick={() => alternar("formatos", v)}
                    extra={b.formatos.length && !b.formatos.includes(v) ? "+2" : undefined}
                  >
                    {l}
                  </Chip>
                ))}
              </div>
            </Campo>
            <Campo id="duracao" label="Duração" hint={`Limite para ${peca?.nome.toLowerCase()}.`} erro="Escolha uma duração.">
              <div className="chips">
                {peca?.duracoes.map((d) => (
                  <Chip key={d} on={b.duracao === d} onClick={() => set("duracao", d)}>
                    {d} segundos
                  </Chip>
                ))}
              </div>
            </Campo>
            <Campo
              id="audio"
              label="Áudio"
              hint={logo ? undefined : "Lembre que muita gente assiste sem som no celular."}
              erro="Escolha uma opção de áudio."
            >
              <div className="chips">
                {opcoesAudio(b).map((o) => (
                  <Chip
                    key={o}
                    on={b.audio === o}
                    onClick={() => {
                      set("audio", o);
                      if (o !== LOCUCAO) set("voz", null);
                    }}
                    extra={o === LOCUCAO ? "+3" : undefined}
                  >
                    {o}
                  </Chip>
                ))}
              </div>
            </Campo>
            {!logo && (
              <Campo id="legendas" label="Legendas" erro="Diga se quer legendas.">
                <div className="chips">
                  {(["Sim", "Não"] as const).map((o) => (
                    <Chip key={o} on={b.legendas === o} onClick={() => set("legendas", o)}>
                      {o}
                    </Chip>
                  ))}
                </div>
              </Campo>
            )}
            <Campo id="aberto" label="Arquivo aberto do After Effects" hint="Útil se sua equipe vai editar a peça depois.">
              <div className="chips">
                <Chip on={b.aberto} onClick={() => set("aberto", true)} extra="+5">
                  Sim
                </Chip>
                <Chip on={!b.aberto} onClick={() => set("aberto", false)}>
                  Não, só o vídeo
                </Chip>
              </div>
            </Campo>
          </>
        );

      case 3: {
        if (logo)
          return (
            <>
              <Campo id="revelacao" label="Tipo de revelação" erro="Escolha um tipo de revelação.">
                <div className="chips">
                  {OPCOES.revelacoes.map((o) => (
                    <Chip key={o} on={b.revelacao === o} onClick={() => set("revelacao", o)}>
                      {o}
                    </Chip>
                  ))}
                </div>
              </Campo>
              <Campo id="slogan" label="Slogan junto ao logo" opcional>
                <input className="txt" value={b.slogan} placeholder="Moda que acompanha você" onChange={(e) => set("slogan", e.target.value)} />
              </Campo>
            </>
          );
        const lim = limitePalavras(b);
        const palavras = b.cenas.reduce((s, c) => s + contarPalavras(c), 0);
        return (
          <>
            <div className="field">
              <label className="check">
                <input type="checkbox" checked={b.semRoteiro} onChange={(e) => set("semRoteiro", e.target.checked)} />
                <span>
                  <b>Não tenho roteiro, quero que criem</b>
                  <br />
                  <span className="opt">Um redator escreve a partir da sua ideia. +4 créditos.</span>
                </span>
              </label>
            </div>
            {b.semRoteiro ? (
              <Campo id="ideia" label="Conte a ideia geral" hint="O que precisa ser dito, em linguagem simples.">
                <textarea
                  className="txt"
                  value={b.ideia}
                  placeholder="Quero divulgar a coleção de verão com 30% de desconto e levar as pessoas para o site."
                  onChange={(e) => set("ideia", e.target.value)}
                />
              </Campo>
            ) : (
              <Campo
                id="cenas"
                label="Roteiro por cena"
                hint={`Para ${b.duracao ?? peca?.duracoes[0]} segundos, o ideal é até ${lim} palavras de texto na tela.`}
                erro="Descreva pelo menos uma cena."
              >
                {b.cenas.map((c, i) => (
                  <div key={i} className={styles.scene}>
                    <span className={styles.n} aria-hidden="true">
                      <b>{i + 1}</b>
                    </span>
                    <input
                      className="txt"
                      value={c}
                      aria-label={`Cena ${i + 1}`}
                      placeholder={PLACEHOLDER_CENAS[i] ?? "O que aparece nesta cena"}
                      onChange={(e) => {
                        const cenas = [...b.cenas];
                        cenas[i] = e.target.value;
                        set("cenas", cenas);
                      }}
                    />
                    {b.cenas.length > 1 ? (
                      <button
                        type="button"
                        className={styles.icon}
                        aria-label={`Remover cena ${i + 1}`}
                        onClick={() => set("cenas", b.cenas.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
                {b.cenas.length < 8 && (
                  <button type="button" className={styles.add} onClick={() => set("cenas", [...b.cenas, ""])}>
                    + Adicionar cena
                  </button>
                )}
                <div className={styles.counter} data-over={palavras > lim}>
                  <span>
                    {palavras} de {lim} palavras{palavras > lim ? ". Texto demais para ler a tempo." : ""}
                  </span>
                  <span className={styles.bar}>
                    <i style={{ width: `${Math.min(100, (palavras / Math.max(1, lim)) * 100)}%` }} />
                  </span>
                </div>
              </Campo>
            )}
            {b.audio === LOCUCAO && (
              <>
                <Campo id="locucao" label="Texto da locução" hint="O que o narrador vai falar, do começo ao fim.">
                  <textarea
                    className="txt"
                    value={b.locucao}
                    placeholder="Chegou a nova coleção de verão..."
                    onChange={(e) => set("locucao", e.target.value)}
                  />
                </Campo>
                <Campo id="voz" label="Tipo de voz" erro="Escolha um tipo de voz.">
                  <div className="chips">
                    {OPCOES.vozes.map((o) => (
                      <Chip key={o} on={b.voz === o} onClick={() => set("voz", o)}>
                        {o}
                      </Chip>
                    ))}
                  </div>
                </Campo>
              </>
            )}
            <Campo id="obrig" label="Informações que não podem faltar" opcional hint="Preços, datas, avisos legais, endereço ou site.">
              <input
                className="txt"
                value={b.obrig}
                placeholder="Válido até 31/01. Desconto não cumulativo."
                onChange={(e) => set("obrig", e.target.value)}
              />
            </Campo>
          </>
        );
      }

      case 4: {
        const escolhaMarca = (
          <Campo
            id="marca"
            label="Para qual marca é este pedido?"
            hint={
              marcas.length
                ? "Use uma marca existente para reaproveitar logo, manual e cores, ou crie uma nova com novos arquivos."
                : "Crie a marca deste pedido. Logo, manual e cores ficam salvos nela."
            }
            erro="Escolha uma marca ou crie uma nova."
          >
            <div className="chips">
              {marcas.map((m) => (
                <Chip key={m.id} on={b.marcaId === m.id} onClick={() => escolherMarca(m)}>
                  {m.nome}
                </Chip>
              ))}
              <Chip on={novaMarca !== null} onClick={() => setNovaMarca(novaMarca === null ? "" : null)}>
                + Nova marca
              </Chip>
            </div>
            {novaMarca !== null && (
              <div className={styles.novaMarca}>
                <input
                  className="txt"
                  value={novaMarca}
                  autoFocus
                  aria-label="Nome da nova marca"
                  placeholder="Nome da nova marca"
                  onChange={(e) => setNovaMarca(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      criarNovaMarca();
                    }
                  }}
                />
                <button type="button" className="btn btn-primary" onClick={criarNovaMarca} disabled={criandoMarca}>
                  {criandoMarca ? "Criando..." : "Criar marca"}
                </button>
              </div>
            )}
          </Campo>
        );
        if (!marcaAtual) return escolhaMarca;
        return (
          <>
            {escolhaMarca}
            <Campo id="logo" label={`Logo da ${marcaAtual.nome}`} erro="Envie ou selecione o logo da marca.">
              <ArquivosMarca {...doPerfil("logo")} />
              <Upload categoria="logo" titulo="Enviar logo" sub="SVG, AI, PDF ou PNG em alta resolução" accept=".svg,.ai,.png,.pdf,.eps" {...upload} />
            </Campo>
            <Campo id="manual" label="Manual de marca e fontes" opcional>
              <ArquivosMarca {...doPerfil("manual")} />
              <Upload categoria="manual" titulo="Enviar arquivos" sub="PDF do manual, arquivos de fonte" multiplo {...upload} />
            </Campo>
            {!logo && (
              <Campo id="fotos" label="Fotos e imagens do produto" opcional>
                {b.arquivos.fotos.length > 0 && (
                  <div className="chips" style={{ marginBottom: 8 }}>
                    {b.arquivos.fotos.map((id) => (
                      <Chip key={id} on onClick={() => alternarArquivo("fotos", id)}>
                        {nomes[id] ?? `Arquivo ${id}`} ×
                      </Chip>
                    ))}
                  </div>
                )}
                <Upload categoria="foto" titulo="Enviar imagens" sub="JPG ou PNG, quantas precisar" accept="image/*" multiplo {...upload} />
              </Campo>
            )}
            <Campo id="cores" label="Cores da marca" hint="Clique na amostra para escolher.">
              <div className={styles.colors}>
                {b.cores.map((c, i) => (
                  <label key={i} className={styles.sw}>
                    <input
                      type="color"
                      value={c}
                      aria-label={`Cor ${i + 1}`}
                      onChange={(e) => {
                        const cores = [...b.cores];
                        cores[i] = e.target.value;
                        set("cores", cores);
                      }}
                    />
                    <span>{c.toUpperCase()}</span>
                    {b.cores.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remover cor ${i + 1}`}
                        onClick={(e) => {
                          e.preventDefault();
                          set("cores", b.cores.filter((_, j) => j !== i));
                        }}
                      >
                        ×
                      </button>
                    )}
                  </label>
                ))}
                {b.cores.length < 5 && (
                  <button type="button" className="btn btn-sm" onClick={() => set("cores", [...b.cores, "#191C2E"])}>
                    + Cor
                  </button>
                )}
              </div>
            </Campo>
            <Campo id="visual" label="Visual desta peça" erro="Escolha uma opção.">
              <div className="chips">
                <Chip on={b.visual === "padrao"} onClick={() => set("visual", "padrao")}>
                  Seguir o padrão da marca
                </Chip>
                <Chip on={b.visual === "especial"} onClick={() => set("visual", "especial")}>
                  Visual especial de campanha
                </Chip>
              </div>
            </Campo>
          </>
        );
      }

      case 5:
        return (
          <>
            <Campo id="estilo" label="Estilo de animação" hint="Pode combinar até dois." erro="Escolha pelo menos um estilo.">
              <div className="chips">
                {OPCOES.estilos.map((o) => (
                  <Chip key={o} on={b.estilo.includes(o)} onClick={() => alternar("estilo", o)}>
                    {o}
                  </Chip>
                ))}
              </div>
            </Campo>
            <Campo id="refs" label="Referências" opcional>
              {b.refs.map((r, i) => (
                <div key={i} className={styles.ref}>
                  <div className={styles.refH}>
                    <span>Referência {i + 1}</span>
                    {b.refs.length > 1 && (
                      <button type="button" onClick={() => set("refs", b.refs.filter((_, j) => j !== i))}>
                        Remover
                      </button>
                    )}
                  </div>
                  <input
                    className="txt"
                    value={r.url}
                    placeholder="Link do vídeo no Instagram, YouTube ou Behance"
                    aria-label={`Link da referência ${i + 1}`}
                    onChange={(e) => set("refs", b.refs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                  />
                  <input
                    className="txt"
                    value={r.gosta}
                    placeholder="O que você gosta: o ritmo, as cores, a transição..."
                    aria-label={`O que gosta na referência ${i + 1}`}
                    onChange={(e) => set("refs", b.refs.map((x, j) => (j === i ? { ...x, gosta: e.target.value } : x)))}
                  />
                </div>
              ))}
              {b.refs.length < 4 && (
                <button type="button" className={styles.add} onClick={() => set("refs", [...b.refs, { url: "", gosta: "" }])}>
                  + Adicionar referência
                </button>
              )}
            </Campo>
            <Campo id="tom" label="Tom" erro="Escolha um tom.">
              <div className="chips">
                {OPCOES.tons.map((o) => (
                  <Chip key={o} on={b.tom === o} onClick={() => set("tom", o)}>
                    {o}
                  </Chip>
                ))}
              </div>
            </Campo>
            <Campo id="evitar" label="O que evitar" opcional hint="Às vezes é mais útil que dizer o que você quer.">
              <input className="txt" value={b.evitar} placeholder="Efeitos 3D e cores neon" onChange={(e) => set("evitar", e.target.value)} />
            </Campo>
          </>
        );

      case 6: {
        const urg = Math.max(1, Math.ceil((peca?.diasUteis ?? 2) / 2));
        return (
          <>
            <div className="field">
              <span className="label">Quando você precisa</span>
              <div className={styles.deadline}>
                <button type="button" className={styles.type} aria-pressed={b.prazo === "padrao"} onClick={() => set("prazo", "padrao")}>
                  <b>Padrão</b>
                  <span className="muted small">{peca?.diasUteis} dias úteis</span>
                  <span className={styles.meta}>
                    <span>Sem custo extra</span>
                  </span>
                </button>
                <button type="button" className={styles.type} aria-pressed={b.prazo === "urgente"} onClick={() => set("prazo", "urgente")}>
                  <b>Urgente</b>
                  <span className="muted small">
                    {urg} {urg > 1 ? "dias úteis" : "dia útil"}
                  </span>
                  <span className={styles.meta}>
                    <span>Prioridade na fila</span>
                    <span className={styles.cr}>+50%</span>
                  </span>
                </button>
              </div>
            </div>
            <div className={styles.two}>
              <Campo id="aprovador" label="Quem aprova a peça" hint="A pessoa que dá a palavra final.">
                <input className="txt" value={b.aprovador} onChange={(e) => set("aprovador", e.target.value)} />
              </Campo>
              <Campo id="email" label="E-mail de quem aprova" hint="Avisamos quando a peça estiver pronta." erro="Digite um e-mail válido.">
                <input className="txt" type="email" inputMode="email" value={b.email} onChange={(e) => set("email", e.target.value)} />
              </Campo>
            </div>
          </>
        );
      }

      default: {
        const cenas = b.cenas.filter((c) => c.trim());
        const linha = (i: number, itens: [string, string | null | undefined | false][]) => (
          <div className={styles.rv} key={i}>
            <h3>{ETAPAS[i]}</h3>
            <dl>
              {itens.filter(([, v]) => v).length ? (
                itens
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}: </dt>
                      <dd>{v}</dd>
                    </div>
                  ))
              ) : (
                <div className="muted">Nada informado</div>
              )}
            </dl>
            <button type="button" onClick={() => irPara(i)}>
              Editar
            </button>
          </div>
        );
        const arquivosNomes = [...b.arquivos.logo, ...b.arquivos.manual, ...b.arquivos.fotos].map((id) => nomes[id] ?? `#${id}`);
        return (
          <div className={styles.review}>
            {linha(0, [["Peça", peca?.nome]])}
            {linha(
              1,
              logo
                ? [["Nome", b.nome], ["Usos", b.uso.join(", ")]]
                : [
                    ["Nome", b.nome],
                    ["Objetivo", b.objetivo],
                    ["Público", b.publico],
                    ["Onde", b.plataformas.join(", ")],
                    ["Chamada", b.cta],
                  ],
            )}
            {linha(2, [
              ["Proporções", b.formatos.join(", ")],
              ["Duração", b.duracao ? `${b.duracao} segundos` : null],
              ["Áudio", b.audio],
              ["Legendas", b.legendas],
              ["Arquivo aberto", b.aberto ? "Sim" : "Não"],
            ])}
            {linha(
              3,
              logo
                ? [["Revelação", b.revelacao], ["Slogan", b.slogan]]
                : [
                    b.semRoteiro ? ["Ideia (roteiro a criar)", b.ideia] : ["Cenas", cenas.map((x, i) => `${i + 1}. ${x}`).join("  ")],
                    ["Locução", b.audio === LOCUCAO && `${b.voz ?? ""}: ${b.locucao}`],
                    ["Obrigatório", b.obrig],
                  ],
            )}
            {linha(4, [
              ["Marca", marcaAtual?.nome],
              ["Arquivos", arquivosNomes.join(", ")],
              ["Cores", b.cores.map((x) => x.toUpperCase()).join(", ")],
              ["Visual", b.visual === "padrao" ? "Padrão da marca" : b.visual === "especial" ? "Especial de campanha" : null],
            ])}
            {linha(5, [
              ["Estilo", b.estilo.join(", ")],
              ["Tom", b.tom],
              ["Referências", b.refs.filter((r) => r.url).map((r) => r.url + (r.gosta ? ` (${r.gosta})` : "")).join("; ")],
              ["Evitar", b.evitar],
            ])}
            {linha(6, [
              ["Prazo", `${dias} dias úteis${b.prazo === "urgente" ? " (urgente)" : ""}`],
              ["Aprovação", `${b.aprovador} · ${b.email}`],
            ])}
          </div>
        );
      }
    }
  }

  const [titulo, lead] = cabecalhos[etapa];
  const botaoPrincipal = etapa === 7 ? (enviando ? "Enviando..." : `Enviar pedido · ${total} cr`) : "Continuar";
  const bloqueado = etapa === 7 && (enviando || falta > 0);

  return (
    <ErrosCtx.Provider value={erros}>
    <div className={styles.wizard}>
      <nav className={styles.timeline} aria-label="Etapas do pedido">
        <div className={styles.track}>
          <div className={styles.fill} style={{ width: `calc(${etapa / 7} * (100% - 100% / 8))` }} />
          {ETAPAS.map((s, i) => {
            const pode = i <= max && i !== etapa;
            return (
              <button
                key={s}
                type="button"
                className={styles.kf}
                data-estado={i < etapa ? "feito" : i === etapa ? "agora" : ""}
                disabled={!pode}
                aria-current={i === etapa ? "step" : undefined}
                aria-label={`Etapa ${i + 1}: ${s}`}
                onClick={() => pode && irPara(i)}
              >
                <span className={styles.d} />
                <small>{s}</small>
              </button>
            );
          })}
        </div>
        <div className={styles.tc}>
          <span>00:0{etapa}</span>
          <span>
            Etapa {etapa + 1} de 8
          </span>
        </div>
      </nav>

      {rascunho && !b.tipo && !descartado && (
        <p className="alerta row-between" style={{ marginBottom: 16 }}>
          <span>Você tem um pedido não enviado salvo neste navegador.</span>
          <span className="row">
            <button type="button" className="btn btn-sm btn-primary" onClick={continuarRascunho}>
              Continuar de onde parei
            </button>
            <button type="button" className="link small" onClick={descartarRascunho}>
              Descartar
            </button>
          </span>
        </p>
      )}

      <div className={styles.wrap}>
        <section className={styles.panel} ref={painel} aria-live="polite">
          <h1>{titulo}</h1>
          <p className={styles.lead}>{lead}</p>
          {renderEtapa()}
          {erroGeral && (
            <p className="alerta alerta-erro" role="alert">
              {erroGeral}
            </p>
          )}
          <div className={styles.nav}>
            {etapa > 0 ? (
              <button type="button" className="btn" onClick={() => irPara(etapa - 1)}>
                Voltar
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="btn btn-primary" onClick={continuar} disabled={bloqueado}>
              {botaoPrincipal}
            </button>
          </div>
        </section>

        <aside className={styles.side} aria-label="Resumo do pedido">
          <h2>Seu pedido</h2>
          {!peca ? (
            <p className="muted small">Escolha o tipo de peça para ver os créditos e o prazo.</p>
          ) : (
            <>
              <div className={styles.lines}>
                {linhas.map((l) => (
                  <div key={l.descricao} className={styles.ln}>
                    <span>{l.descricao}</span>
                    <span>{l.creditos} cr</span>
                  </div>
                ))}
              </div>
              <div className={styles.total}>
                <span className="muted">Total</span>
                <b>
                  {total}
                  <span> créditos</span>
                </b>
              </div>
              <div className={styles.saldo} data-falta={falta > 0}>
                Seu saldo: <b>{saldo} créditos</b>
                {falta > 0 && (
                  <>
                    <br />
                    Faltam {falta}. <Link href="/cliente/creditos">Comprar créditos</Link>
                  </>
                )}
              </div>
              <div className={styles.facts}>
                <div>
                  <strong>{dias} dias</strong>úteis de prazo
                </div>
                <div>
                  <strong>{peca.revisoes} rodadas</strong>de ajuste
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

      <div className={styles.mbar}>
        <div className={styles.sum}>
          {peca ? (
            <>
              Total <b>{total} créditos</b>
              <span data-falta={falta > 0}>Saldo {saldo}</span>
            </>
          ) : (
            "Escolha a peça"
          )}
        </div>
        {etapa > 0 && (
          <button type="button" className="btn" onClick={() => irPara(etapa - 1)}>
            Voltar
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={continuar} disabled={bloqueado}>
          {etapa === 7 ? (enviando ? "Enviando..." : "Enviar") : "Continuar"}
        </button>
      </div>
    </div>
    </ErrosCtx.Provider>
  );
}
