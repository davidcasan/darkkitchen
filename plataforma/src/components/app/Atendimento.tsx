"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icone } from "./Icone";
import { NOME_ATENDIMENTO } from "@/domain/contato";
import styles from "./Atendimento.module.css";

// Chat do atendimento (SAC) entre o cliente e o admin. Conversa por pedido ou
// geral. Fala com a API /api/v1/atendimento e atualiza sozinho enquanto aberto.

interface Mensagem {
  id: number;
  texto: string;
  criado_em: string;
  autor_nome: string;
  da_equipe: number;
  imagem_nome: string | null;
}

export interface AlvoConversa {
  pedidoId?: number | null;
  clienteId?: number | null;
}

type Visao = "cliente" | "admin";

const ATUALIZAR_ABERTO_MS = 4000;
const ATUALIZAR_FECHADO_MS = 30000;
/** Evento para abrir o chat a partir de qualquer botão da página. */
export const EVENTO_ABRIR = "dk:abrir-atendimento";

const consulta = (a: AlvoConversa, extra: Record<string, string | number> = {}) => {
  const q = new URLSearchParams();
  if (a.pedidoId) q.set("pedido", String(a.pedidoId));
  if (a.clienteId) q.set("cliente", String(a.clienteId));
  for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
  return `/api/v1/atendimento?${q}`;
};

const horario = (s: string) =>
  new Date(s.replace(" ", "T") + "Z").toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const LIMITE_IMAGEM_MB = 2;
const TIPOS_IMAGEM = ["image/png", "image/jpeg", "image/bmp"];
const urlImagem = (mensagemId: number) => `/api/v1/atendimento/imagem/${mensagemId}`;

/** Confere a imagem antes de enviar (o servidor confere de novo). */
function problemaNaImagem(f: File) {
  const tipoOk = TIPOS_IMAGEM.includes(f.type) || /\.(png|jpe?g|bmp)$/i.test(f.name);
  if (!tipoOk) return "Envie uma imagem PNG, JPG ou BMP.";
  if (f.size > LIMITE_IMAGEM_MB * 1024 * 1024) return `A imagem passa do limite de ${LIMITE_IMAGEM_MB} MB.`;
  return null;
}

type EstadoEnvio = "enviando" | "enviada" | "lida" | "falhou";

const ROTULO_ESTADO: Record<EstadoEnvio, string> = {
  enviando: "Enviando",
  enviada: "Enviada",
  lida: "Lida",
  falhou: "Não enviada",
};

/** Marcador ao lado do horário, como no Telegram: relógio, ✓ enviada, ✓✓ lida. */
function Marcador({ estado }: { estado: EstadoEnvio }) {
  return (
    <span className={styles.marcador} data-estado={estado} title={ROTULO_ESTADO[estado]} aria-label={ROTULO_ESTADO[estado]}>
      {estado === "enviando" ? (
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.8V8l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : estado === "falhou" ? (
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path d="M8 4.5v4.2M8 11.2v.1" stroke="var(--paper)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 12" width="18" height="11" aria-hidden="true">
          <path
            d="M1.5 6.5l3.2 3.2L11 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {estado === "lida" && (
            <path
              d="M8.2 9.2l.5.5L15 3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      )}
    </span>
  );
}

interface Pendente {
  chave: number;
  texto: string;
  imagem: File | null;
  previa: string | null; // endereço local da imagem, para mostrar antes de o servidor confirmar
  estado: "enviando" | "falhou";
}

/** Painel da conversa: mensagens, campo de texto, imagem e envio. O admin também apaga. */
export function PainelAtendimento({
  alvo,
  visao,
  titulo,
  aoFechar,
  aoApagarConversa,
  embutido = false,
}: {
  alvo: AlvoConversa;
  visao: Visao;
  titulo?: string;
  aoFechar?: () => void;
  aoApagarConversa?: () => void;
  embutido?: boolean;
}) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [lidaAte, setLidaAte] = useState(0);
  const [tituloApi, setTituloApi] = useState<string>("");
  const [texto, setTexto] = useState("");
  const [anexo, setAnexo] = useState<{ arquivo: File; previa: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregou, setCarregou] = useState(false);
  const ultimoId = useRef(0);
  const proximaChave = useRef(1);
  const lista = useRef<HTMLDivElement>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const { pedidoId, clienteId } = alvo;
  const ehAdmin = visao === "admin";
  const minha = useCallback((m: Mensagem) => (visao === "admin" ? m.da_equipe === 1 : m.da_equipe === 0), [visao]);

  const buscar = useCallback(async () => {
    try {
      const r = await fetch(consulta({ pedidoId, clienteId }, { depois: ultimoId.current }), { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) {
        setErro(j.erro ?? "Não foi possível carregar a conversa.");
        return;
      }
      setTituloApi(j.dados.titulo);
      setLidaAte(j.dados.lidaAte ?? 0);
      const novas: Mensagem[] = j.dados.mensagens;
      const existentes = new Set<number>(j.dados.ids ?? []);
      if (novas.length) ultimoId.current = novas[novas.length - 1].id;
      // Junta as novas e tira as que o admin apagou.
      setMensagens((m) => {
        const juntas = [...m, ...novas.filter((n) => !m.some((x) => x.id === n.id))].filter((x) => existentes.has(x.id));
        return juntas.length === m.length && novas.length === 0 ? m : juntas;
      });
      // Mensagens do outro lado acabaram de ser lidas: atualiza os contadores da página (menu, lista).
      if (novas.some((n) => !minha(n))) router.refresh();
      setErro(null);
    } catch {
      setErro("Sem conexão. Tentando de novo...");
    } finally {
      setCarregou(true);
    }
  }, [pedidoId, clienteId, minha, router]);

  useEffect(() => {
    const primeira = setTimeout(buscar, 0);
    const t = setInterval(buscar, ATUALIZAR_ABERTO_MS);
    return () => {
      clearTimeout(primeira);
      clearInterval(t);
    };
  }, [buscar]);

  // Desce até a última mensagem quando chegam novas.
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [mensagens.length, pendentes.length]);

  function escolherImagem(f: File | null | undefined) {
    if (!f) return;
    const problema = problemaNaImagem(f);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    setAnexo((a) => {
      if (a) URL.revokeObjectURL(a.previa);
      return { arquivo: f, previa: URL.createObjectURL(f) };
    });
  }

  async function mandar(p: Omit<Pendente, "estado" | "chave">, chaveExistente?: number) {
    const chave = chaveExistente ?? proximaChave.current++;
    setPendentes((lista) =>
      chaveExistente
        ? lista.map((x) => (x.chave === chave ? { ...x, estado: "enviando" } : x))
        : [...lista, { ...p, chave, estado: "enviando" }],
    );
    setErro(null);
    try {
      let corpo: BodyInit;
      const headers: HeadersInit = {};
      if (p.imagem) {
        const fd = new FormData();
        fd.append("texto", p.texto);
        if (pedidoId) fd.append("pedido", String(pedidoId));
        if (clienteId) fd.append("cliente", String(clienteId));
        fd.append("imagem", p.imagem);
        corpo = fd;
      } else {
        headers["Content-Type"] = "application/json";
        corpo = JSON.stringify({ texto: p.texto, pedido: pedidoId ?? undefined, cliente: clienteId ?? undefined });
      }
      const r = await fetch("/api/v1/atendimento", { method: "POST", headers, body: corpo });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível enviar.");
      await buscar(); // a mensagem salva chega pela lista; só então sai o rascunho
      setPendentes((lista) => {
        const saindo = lista.find((x) => x.chave === chave);
        if (saindo?.previa) URL.revokeObjectURL(saindo.previa);
        return lista.filter((x) => x.chave !== chave);
      });
    } catch (e) {
      setPendentes((lista) => lista.map((x) => (x.chave === chave ? { ...x, estado: "falhou" } : x)));
      setErro(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Sem conexão. A mensagem não foi enviada.");
    }
  }

  function enviar() {
    const t = texto.trim();
    if (!t && !anexo) return;
    setTexto("");
    setAnexo(null);
    mandar({ texto: t, imagem: anexo?.arquivo ?? null, previa: anexo?.previa ?? null });
  }

  async function apagar(url: string, confirmar: string) {
    if (!window.confirm(confirmar)) return false;
    const r = await fetch(url, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErro(j.erro ?? "Não foi possível apagar.");
      return false;
    }
    return true;
  }

  async function apagarMensagem(m: Mensagem) {
    if (await apagar(`/api/v1/atendimento?mensagem=${m.id}`, "Apagar esta mensagem? O cliente também deixa de vê-la."))
      setMensagens((lista) => lista.filter((x) => x.id !== m.id));
  }

  async function apagarConversa() {
    const confirmar = "Apagar a conversa inteira, com todas as mensagens e imagens? Não dá para desfazer.";
    if (await apagar(consulta({ pedidoId, clienteId }, { conversa: 1 }), confirmar)) {
      setMensagens([]);
      if (aoApagarConversa) aoApagarConversa();
      // Na página de atendimento do admin, a conversa some da lista: volta para a lista.
      else if (embutido) router.replace("/equipe/atendimento");
      router.refresh();
    }
  }

  const estadoDe = (m: Mensagem): EstadoEnvio => (m.id <= lidaAte ? "lida" : "enviada");

  return (
    <section className={styles.painel} data-embutido={embutido} aria-label="Atendimento">
      <header className={styles.cabeca}>
        <div>
          <b>{visao === "cliente" ? NOME_ATENDIMENTO : (titulo ?? "Atendimento")}</b>
          <small>{visao === "cliente" ? tituloApi || titulo : tituloApi}</small>
        </div>
        <span className={styles.acoesCabeca}>
          {ehAdmin && mensagens.length > 0 && (
            <button type="button" className={styles.apagarTudo} onClick={apagarConversa} title="Apagar conversa">
              <Icone nome="lixeira" tamanho={16} />
              <span>Apagar conversa</span>
            </button>
          )}
          {aoFechar && (
            <button type="button" className={styles.fechar} onClick={aoFechar} aria-label="Fechar atendimento">
              ×
            </button>
          )}
        </span>
      </header>
      <div className={styles.lista} ref={lista} aria-live="polite">
        {!carregou && <p className={styles.vazio}>Carregando...</p>}
        {carregou && mensagens.length === 0 && pendentes.length === 0 && (
          <p className={styles.vazio}>
            {visao === "cliente"
              ? "Mande sua dúvida por aqui. O atendimento responde nesta conversa e você recebe um aviso."
              : "Nenhuma mensagem ainda. Escreva para iniciar a conversa com o cliente."}
          </p>
        )}
        {mensagens.map((m) => (
          <div key={m.id} className={styles.msg} data-minha={minha(m)}>
            {!minha(m) && (
              <span className={styles.autor}>
                {m.da_equipe && visao !== "cliente" ? `Atendimento · ${m.autor_nome}` : m.autor_nome}
              </span>
            )}
            <div className={styles.balao}>
              {m.imagem_nome && (
                <a href={urlImagem(m.id)} target="_blank" rel="noopener" className={styles.imagem}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem privada servida pela API */}
                  <img src={urlImagem(m.id)} alt={m.imagem_nome} loading="lazy" />
                </a>
              )}
              {m.texto}
              <span className={styles.meta}>
                {horario(m.criado_em)}
                {minha(m) && <Marcador estado={estadoDe(m)} />}
              </span>
            </div>
            {ehAdmin && (
              <button type="button" className={styles.apagar} onClick={() => apagarMensagem(m)} aria-label="Apagar mensagem">
                <Icone nome="lixeira" tamanho={14} /> Apagar
              </button>
            )}
          </div>
        ))}
        {pendentes.map((p) => (
          <div key={`p${p.chave}`} className={styles.msg} data-minha="true" data-pendente={p.estado}>
            <div className={styles.balao}>
              {p.previa && (
                <span className={styles.imagem}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- prévia local antes do envio */}
                  <img src={p.previa} alt={p.imagem?.name ?? "Imagem"} />
                </span>
              )}
              {p.texto}
              <span className={styles.meta}>
                {p.estado === "falhou" ? (
                  <button type="button" className={styles.reenviar} onClick={() => mandar(p, p.chave)}>
                    Tentar de novo
                  </button>
                ) : (
                  "agora"
                )}
                <Marcador estado={p.estado} />
              </span>
            </div>
          </div>
        ))}
      </div>
      <form
        className={styles.envio}
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        {erro && (
          <p className={styles.erro} role="alert">
            {erro}
          </p>
        )}
        {anexo && (
          <div className={styles.anexo}>
            {/* eslint-disable-next-line @next/next/no-img-element -- prévia local antes do envio */}
            <img src={anexo.previa} alt="" />
            <span>{anexo.arquivo.name}</span>
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(anexo.previa);
                setAnexo(null);
              }}
              aria-label="Tirar imagem"
            >
              ×
            </button>
          </div>
        )}
        <div className={styles.campo}>
          <button
            type="button"
            className={styles.clipe}
            onClick={() => seletor.current?.click()}
            aria-label="Anexar imagem (PNG, JPG ou BMP, até 2 MB)"
            title="Anexar imagem (PNG, JPG ou BMP, até 2 MB)"
          >
            <Icone nome="clipe" tamanho={20} />
          </button>
          <input
            ref={seletor}
            type="file"
            accept=".png,.jpg,.jpeg,.bmp,image/png,image/jpeg,image/bmp"
            hidden
            onChange={(e) => {
              escolherImagem(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            onPaste={(e) => {
              const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
              if (f) {
                e.preventDefault();
                escolherImagem(f);
              }
            }}
            placeholder="Escreva sua mensagem"
            rows={2}
            maxLength={4000}
            aria-label="Mensagem"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!texto.trim() && !anexo}>
            Enviar
          </button>
        </div>
        <small className={styles.nota}>
          {ehAdmin
            ? "Imagens PNG, JPG ou BMP até 2 MB. ✓ enviada · ✓✓ lida. Só o admin apaga mensagens."
            : "Imagens PNG, JPG ou BMP até 2 MB. As conversas ficam salvas. ✓ enviada · ✓✓ lida"}
        </small>
      </form>
    </section>
  );
}

/** Qual conversa a página atual abre: a do pedido aberto ou, para o cliente, a geral. */
function alvoDaPagina(pathname: string, visao: Visao): AlvoConversa | null {
  const m = pathname.match(visao === "cliente" ? /^\/cliente\/pedidos\/(\d+)/ : /^\/equipe\/pedidos\/(\d+)/);
  if (m) return { pedidoId: Number(m[1]) };
  return visao === "cliente" ? {} : null;
}

/** Botão no canto da página que abre o chat (com o número de mensagens não lidas). */
export function BotaoAtendimento({ visao }: { visao: Visao }) {
  const pathname = usePathname();
  const router = useRouter();
  const alvo = alvoDaPagina(pathname, visao);
  const chaveAlvo = alvo ? `${alvo.pedidoId ?? "geral"}` : null;
  const [aberto, setAberto] = useState<string | null>(null); // chave da conversa aberta
  const [naoLidas, setNaoLidas] = useState(0);
  const estaAberto = aberto !== null && aberto === chaveAlvo;

  // Abre sozinho quando o endereço tem ?chat=1 (link das notificações) ou por evento.
  useEffect(() => {
    if (!chaveAlvo) return;
    const abrir = () => setAberto(chaveAlvo);
    const url = new URL(window.location.href);
    if (url.searchParams.get("chat") === "1") {
      url.searchParams.delete("chat");
      // Pelo roteador do Next (e não history.replaceState): senão a próxima atualização da
      // página devolve o "?chat=1" ao endereço.
      router.replace(url.pathname + url.search + url.hash, { scroll: false });
      // Sem cancelar na limpeza: o efeito pode rodar duas vezes e, na segunda, o
      // "?chat=1" já saiu do endereço.
      setTimeout(abrir, 0);
    }
    window.addEventListener(EVENTO_ABRIR, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR, abrir);
  }, [chaveAlvo, router]);

  // Fechado: confere de tempos em tempos se chegou mensagem.
  useEffect(() => {
    if (!chaveAlvo || estaAberto) return;
    const pedidoId = chaveAlvo === "geral" ? null : Number(chaveAlvo);
    const contar = async () => {
      try {
        const r = await fetch(consulta({ pedidoId }, { contar: 1 }), { cache: "no-store" });
        if (r.ok) setNaoLidas((await r.json()).dados.naoLidas);
      } catch {}
    };
    const primeira = setTimeout(contar, 0);
    const t = setInterval(contar, ATUALIZAR_FECHADO_MS);
    return () => {
      clearTimeout(primeira);
      clearInterval(t);
    };
  }, [chaveAlvo, estaAberto]);

  if (!alvo || !chaveAlvo) return null;
  return (
    <>
      {estaAberto ? (
        <div className={styles.flutuante}>
          <PainelAtendimento
            key={chaveAlvo}
            alvo={alvo}
            visao={visao}
            titulo={alvo.pedidoId ? undefined : "Dúvidas gerais, créditos e conta"}
            aoFechar={() => {
              setAberto(null);
              setNaoLidas(0);
            }}
          />
        </div>
      ) : (
        <button type="button" className={styles.botao} onClick={() => setAberto(chaveAlvo)}>
          <Icone nome="chat" tamanho={20} />
          <span>{alvo.pedidoId ? "Atendimento deste pedido" : "Atendimento"}</span>
          {naoLidas > 0 && <span className={styles.selo}>{naoLidas > 9 ? "9+" : naoLidas}</span>}
        </button>
      )}
    </>
  );
}

/** Botão comum (dentro da página) que abre o chat flutuante. */
export function AbrirAtendimento({ children, className = "btn btn-sm" }: { children: React.ReactNode; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR))}>
      {children}
    </button>
  );
}
