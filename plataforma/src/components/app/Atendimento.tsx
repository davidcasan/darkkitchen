"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icone } from "./Icone";
import styles from "./Atendimento.module.css";

// Chat do atendimento (SAC) entre o cliente e o admin. Conversa por pedido ou
// geral. Fala com a API /api/v1/atendimento e atualiza sozinho enquanto aberto.

interface Mensagem {
  id: number;
  texto: string;
  criado_em: string;
  autor_nome: string;
  da_equipe: number;
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
  estado: "enviando" | "falhou";
}

/** Painel da conversa: mensagens, campo de texto e envio. */
export function PainelAtendimento({
  alvo,
  visao,
  titulo,
  aoFechar,
  embutido = false,
}: {
  alvo: AlvoConversa;
  visao: Visao;
  titulo?: string;
  aoFechar?: () => void;
  embutido?: boolean;
}) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [lidaAte, setLidaAte] = useState(0);
  const [tituloApi, setTituloApi] = useState<string>("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregou, setCarregou] = useState(false);
  const ultimoId = useRef(0);
  const proximaChave = useRef(1);
  const lista = useRef<HTMLDivElement>(null);
  const { pedidoId, clienteId } = alvo;
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
      if (novas.length) {
        ultimoId.current = novas[novas.length - 1].id;
        setMensagens((m) => [...m, ...novas.filter((n) => !m.some((x) => x.id === n.id))]);
        // Mensagens do outro lado acabaram de ser lidas: atualiza os contadores da página (menu, lista).
        if (novas.some((n) => !minha(n))) router.refresh();
      }
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

  async function mandar(t: string, chaveExistente?: number) {
    const chave = chaveExistente ?? proximaChave.current++;
    setPendentes((p) =>
      chaveExistente
        ? p.map((x) => (x.chave === chave ? { ...x, estado: "enviando" } : x))
        : [...p, { chave, texto: t, estado: "enviando" }],
    );
    setErro(null);
    try {
      const r = await fetch("/api/v1/atendimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: t, pedido: pedidoId ?? undefined, cliente: clienteId ?? undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível enviar.");
      await buscar(); // a mensagem salva chega pela lista; só então sai o rascunho
      setPendentes((p) => p.filter((x) => x.chave !== chave));
    } catch (e) {
      setPendentes((p) => p.map((x) => (x.chave === chave ? { ...x, estado: "falhou" } : x)));
      setErro(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Sem conexão. A mensagem não foi enviada.");
    }
  }

  function enviar() {
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    mandar(t);
  }

  const estadoDe = (m: Mensagem): EstadoEnvio => (m.id <= lidaAte ? "lida" : "enviada");

  return (
    <section className={styles.painel} data-embutido={embutido} aria-label="Atendimento">
      <header className={styles.cabeca}>
        <div>
          <b>{visao === "cliente" ? "Atendimento Dark Kitchen" : (titulo ?? "Atendimento")}</b>
          <small>{visao === "cliente" ? tituloApi || titulo : tituloApi}</small>
        </div>
        {aoFechar && (
          <button type="button" className={styles.fechar} onClick={aoFechar} aria-label="Fechar atendimento">
            ×
          </button>
        )}
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
              <span className={styles.autor}>{m.da_equipe ? `Atendimento · ${m.autor_nome}` : m.autor_nome}</span>
            )}
            <p>
              {m.texto}
              <span className={styles.meta}>
                {horario(m.criado_em)}
                {minha(m) && <Marcador estado={estadoDe(m)} />}
              </span>
            </p>
          </div>
        ))}
        {pendentes.map((p) => (
          <div key={`p${p.chave}`} className={styles.msg} data-minha="true" data-pendente={p.estado}>
            <p>
              {p.texto}
              <span className={styles.meta}>
                {p.estado === "falhou" ? (
                  <button type="button" className={styles.reenviar} onClick={() => mandar(p.texto, p.chave)}>
                    Tentar de novo
                  </button>
                ) : (
                  "agora"
                )}
                <Marcador estado={p.estado} />
              </span>
            </p>
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
        <div className={styles.campo}>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            placeholder="Escreva sua mensagem"
            rows={2}
            maxLength={4000}
            aria-label="Mensagem"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!texto.trim()}>
            Enviar
          </button>
        </div>
        <small className={styles.nota}>As conversas ficam salvas e não podem ser apagadas. ✓ enviada · ✓✓ lida</small>
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
