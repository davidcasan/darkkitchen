"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { marcarTutorialVistoAction } from "@/app/actions/conta";
import { CAPITULOS_TUTORIAL, capituloDaEtapa } from "@/domain/tutorial";
import styles from "./Tutorial.module.css";

// Tutorial do cliente: abre sozinho no primeiro acesso (TutorialPrimeiroAcesso), fica
// na página /cliente/tutorial (TutorialConteudo) e no formulário de pedido (BotaoDicas).

export function TutorialConteudo({
  inicial = 0,
  noFim,
  rotuloFim = "Concluir",
}: {
  inicial?: number;
  noFim?: () => void; // sem ele, o último passo leva a um novo pedido
  rotuloFim?: string;
}) {
  const [i, setI] = useState(inicial);
  const corpo = useRef<HTMLDivElement>(null);
  const indice = useRef<HTMLElement>(null);
  // No celular o índice é uma faixa rolável: mantém o capítulo atual à vista.
  useEffect(() => {
    indice.current?.querySelector("[aria-current=step]")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [i]);
  const c = CAPITULOS_TUTORIAL[i];
  const ultimo = i === CAPITULOS_TUTORIAL.length - 1;
  const ir = (n: number) => {
    setI(n);
    corpo.current?.scrollTo({ top: 0 });
  };

  return (
    <div className={styles.tutorial}>
      <nav className={styles.indice} ref={indice} aria-label="Capítulos do tutorial">
        <ol>
          {CAPITULOS_TUTORIAL.map((cap, n) => (
            <li key={cap.id}>
              <button type="button" aria-current={n === i ? "step" : undefined} data-feito={n < i} onClick={() => ir(n)}>
                {cap.rotulo}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className={styles.corpo} ref={corpo}>
        <p className={styles.passo}>
          {i + 1} de {CAPITULOS_TUTORIAL.length}
        </p>
        <h2 className={styles.titulo}>{c.titulo}</h2>
        <p className={styles.resumo}>{c.resumo}</p>
        <dl className={styles.dicas}>
          {c.dicas.map((d) => (
            <div key={d.titulo}>
              <dt>{d.titulo}</dt>
              <dd>{d.texto}</dd>
            </div>
          ))}
        </dl>
        {c.destaque && <p className={styles.destaque}>{c.destaque}</p>}
        <div className={styles.barra}>
          <button type="button" className="btn" onClick={() => ir(i - 1)} disabled={i === 0}>
            Anterior
          </button>
          {!ultimo ? (
            <button type="button" className="btn btn-primary" onClick={() => ir(i + 1)}>
              Próximo
            </button>
          ) : noFim ? (
            <button type="button" className="btn btn-primary" onClick={noFim}>
              {rotuloFim}
            </button>
          ) : (
            <Link href="/cliente/pedidos/novo" className="btn btn-primary">
              Fazer um pedido
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function JanelaTutorial({ aberta, inicial, aoFechar }: { aberta: boolean; inicial: number; aoFechar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta && !d.open) d.showModal();
    if (!aberta && d.open) d.close();
  }, [aberta]);

  return (
    <dialog ref={ref} className={styles.janela} aria-label="Tutorial" onClose={aoFechar}>
      <div className={styles.topo}>
        <b>Como funciona</b>
        <button type="button" className={styles.fechar} onClick={aoFechar} aria-label="Fechar o tutorial">
          ×
        </button>
      </div>
      {aberta && <TutorialConteudo key={inicial} inicial={inicial} noFim={aoFechar} />}
    </dialog>
  );
}

/** Abre sozinho no primeiro acesso; ao fechar (concluído ou pulado), fica marcado como visto. */
export function TutorialPrimeiroAcesso() {
  // A janela (dialog) só abre no navegador: o efeito da JanelaTutorial chama showModal().
  const [aberta, setAberta] = useState(true);
  const fechar = () => {
    setAberta(false);
    void marcarTutorialVistoAction();
  };
  return <JanelaTutorial aberta={aberta} inicial={0} aoFechar={fechar} />;
}

/** Botão do formulário de pedido: abre o tutorial no capítulo da etapa atual. */
export function BotaoDicas({ etapa }: { etapa: number }) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button type="button" className={styles.botaoDicas} onClick={() => setAberta(true)}>
        <span aria-hidden="true">?</span> Dicas desta etapa
      </button>
      <JanelaTutorial aberta={aberta} inicial={Math.max(0, capituloDaEtapa(etapa))} aoFechar={() => setAberta(false)} />
    </>
  );
}
