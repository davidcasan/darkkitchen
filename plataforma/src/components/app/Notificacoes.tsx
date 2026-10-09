import Link from "next/link";
import { marcarLidasAction } from "@/app/actions/conta";
import { formatarDataHora } from "@/server/datas";
import type { Notificacao } from "@/server/services/notificacoes";
import styles from "./Notificacoes.module.css";

export function Notificacoes({ itens }: { itens: Notificacao[] }) {
  const naoLidas = itens.filter((n) => !n.lida).length;
  return (
    <section className="card" id="novidades">
      <div className="row-between" style={{ marginBottom: 10 }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          Novidades {naoLidas > 0 && <span className="badge" data-tom="acao">{naoLidas} novas</span>}
        </h2>
        {naoLidas > 0 && (
          <form action={marcarLidasAction}>
            <button type="submit" className="link small">
              Marcar como lidas
            </button>
          </form>
        )}
      </div>
      {itens.length === 0 ? (
        <p className="muted small">Nada novo por enquanto.</p>
      ) : (
        <ul className={styles.lista}>
          {itens.map((n) => (
            <li key={n.id} data-lida={n.lida === 1}>
              {n.link ? <Link href={n.link}>{n.texto}</Link> : <span>{n.texto}</span>}
              <small>{formatarDataHora(n.criado_em)}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
