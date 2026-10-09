"use client";

import { useActionState, useRef, useState } from "react";
import { comentarAction } from "@/app/actions/pedido";
import { formatarTempo } from "@/domain/pedido";
import type { Comentario, Versao } from "@/server/services/pedidos";
import { Enviar } from "./FormAcao";
import { formatarTamanho, urlArquivo } from "./upload";
import styles from "./VersaoPlayer.module.css";

const STATUS_VERSAO: Record<Versao["status"], string> = {
  qualidade: "Em controle de qualidade",
  reprovada: "Reprovada internamente",
  com_cliente: "Com o cliente",
  ajuste: "Ajuste pedido",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
};

export function VersaoPlayer({
  pedidoId,
  versoes,
  comentarios,
  equipe,
  podeComentar,
  usuarioId,
}: {
  pedidoId: number;
  versoes: Versao[];
  comentarios: Comentario[];
  equipe: boolean;
  podeComentar: boolean;
  usuarioId: number;
}) {
  const [versaoId, setVersaoId] = useState(versoes[0]?.id ?? null);
  const [tempo, setTempo] = useState(0);
  const [marcar, setMarcar] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const [estado, acao] = useActionState(comentarAction, null);

  const versao = versoes.find((v) => v.id === versaoId) ?? versoes[0];
  // O cliente só vê versões liberadas; numera pelo que ele recebeu (1, 2, 3...), não pela contagem interna.
  const numero = (v: Versao) => (equipe ? v.numero : versoes.length - versoes.indexOf(v));
  const daVersao = comentarios
    .filter((c) => (versao ? c.versao_id === versao.id : c.versao_id === null))
    .sort((a, b) => (a.tempo ?? Infinity) - (b.tempo ?? Infinity) || a.id - b.id);
  const gerais = versao ? comentarios.filter((c) => c.versao_id === null) : [];

  const irPara = (t: number) => {
    if (!video.current) return;
    video.current.currentTime = t;
    video.current.play().catch(() => {});
  };

  const ehVideo = versao?.arquivo_mime.startsWith("video/");

  return (
    <div className={styles.wrap}>
      {versoes.length > 1 && (
        <div className="chips" aria-label="Versões">
          {versoes.map((v) => (
            <button
              key={v.id}
              type="button"
              className="chip"
              aria-pressed={v.id === versao?.id}
              onClick={() => setVersaoId(v.id)}
            >
              Versão {numero(v)}
            </button>
          ))}
        </div>
      )}

      {versao ? (
        <>
          <div className={styles.palco}>
            {ehVideo ? (
              <video
                key={versao.id}
                ref={video}
                src={urlArquivo(versao.arquivo_id, false, versao.arquivo_token)}
                controls
                playsInline
                preload="metadata"
                onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)}
              />
            ) : (
              <a className="btn" href={urlArquivo(versao.arquivo_id, true)}>
                Baixar {versao.arquivo_nome}
              </a>
            )}
          </div>
          <div className={styles.info}>
            <div>
              <b>Versão {numero(versao)}</b>
              {equipe && <span className="muted small"> · {STATUS_VERSAO[versao.status]}</span>}
              <span className="muted small"> · por {versao.autor_nome}</span>
            </div>
            <a className="link small" href={urlArquivo(versao.arquivo_id, true)}>
              Baixar vídeo
            </a>
          </div>
          {versao.nota && <p className={styles.nota}>“{versao.nota}”</p>}
          {versao.extras.length > 0 && (
            <div className="arquivos" style={{ marginTop: 10 }}>
              {versao.extras.map((a) => (
                <a key={a.id} className="arquivo" href={urlArquivo(a.id, true)}>
                  <span>{a.nome}</span>
                  <small className="muted">{formatarTamanho(a.tamanho)}</small>
                </a>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="vazio">A primeira versão aparece aqui assim que estiver pronta.</p>
      )}

      <h3 className={styles.h}>Comentários{versao ? ` da versão ${numero(versao)}` : ""}</h3>
      <ul className={styles.comentarios}>
        {[...daVersao, ...gerais].map((c) => (
          <li key={c.id} data-interno={c.interno === 1} data-meu={c.autor_id === usuarioId}>
            <div className={styles.cHead}>
              <b>{c.autor_nome}</b>
              {c.autor_papel !== "cliente" && !equipe && <span className="muted small">Equipe Dark Kitchen</span>}
              {c.interno === 1 && <span className="tag">Interno</span>}
              {c.tempo !== null && versao && c.versao_id === versao.id && (
                <button type="button" className={styles.tempo} onClick={() => irPara(c.tempo!)}>
                  ▶ {formatarTempo(c.tempo)}
                </button>
              )}
            </div>
            <p>{c.texto}</p>
          </li>
        ))}
        {daVersao.length + gerais.length === 0 && <li className="muted small">Nenhum comentário ainda.</li>}
      </ul>

      {podeComentar && (
        <form action={acao} className={styles.form}>
          <input type="hidden" name="pedido" value={pedidoId} />
          <input type="hidden" name="versao" value={versao?.id ?? ""} />
          <input type="hidden" name="tempo" value={versao && ehVideo && marcar ? tempo.toFixed(2) : ""} />
          <label className="sr-only" htmlFor="novo-comentario">
            Comentário
          </label>
          <textarea
            id="novo-comentario"
            name="texto"
            className="txt"
            required
            placeholder={versao ? "Pause o vídeo no ponto certo e escreva o que mudar." : "Escreva uma mensagem."}
          />
          <div className="row-between">
            <div className="row">
              {versao && ehVideo && (
                <label className="row small">
                  <input type="checkbox" checked={marcar} onChange={(e) => setMarcar(e.target.checked)} />
                  Marcar em {formatarTempo(tempo)}
                </label>
              )}
              {equipe && (
                <label className="row small">
                  <input type="checkbox" name="interno" value="1" defaultChecked />
                  Só para a equipe
                </label>
              )}
            </div>
            <Enviar className="btn btn-primary btn-sm">Comentar</Enviar>
          </div>
          {estado?.erro && <p className="alerta alerta-erro">{estado.erro}</p>}
        </form>
      )}
    </div>
  );
}
