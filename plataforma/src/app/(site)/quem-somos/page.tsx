import type { Metadata } from "next";
import Link from "next/link";
import { perfisVisiveis, urlMidia } from "@/server/services/perfis";
import styles from "./quem-somos.module.css";

export const metadata: Metadata = {
  title: "Quem somos",
  description: "Conheça quem está na cozinha da Dark Kitchen Studio.",
};

export default function QuemSomos() {
  const perfis = perfisVisiveis();

  return (
    <section className={`container ${styles.pagina}`}>
      <div className={styles.head}>
        <span className="eyebrow">Quem somos</span>
        <h1>
          Gente de verdade <span className="brasa">na cozinha.</span>
        </h1>
        <p>Cada peça passa pelas mãos de quem vive de criar. Conheça quem está por trás dos seus pedidos.</p>
      </div>

      {perfis.length === 0 ? (
        <p className="muted">Em breve.</p>
      ) : (
        <div className={styles.perfis}>
          {perfis.map((p) => (
            <article key={p.id} className={styles.perfil}>
              <div className={styles.topo}>
                {p.foto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.foto} src={urlMidia(p.foto)} alt={`Foto de ${p.nome}`} />
                )}
                <div className={styles.texto}>
                  <h2>{p.nome}</h2>
                  {p.funcao && <p className={styles.funcao}>{p.funcao}</p>}
                  {p.bio
                    .split(/\n\s*\n/)
                    .filter((t) => t.trim())
                    .map((t, i) => (
                      <p key={i} className={styles.bio}>
                        {t.trim()}
                      </p>
                    ))}
                </div>
              </div>
              {(p.video_16x9 || p.video_9x16) && (
                <div className={styles.videos} data-dois={Boolean(p.video_16x9 && p.video_9x16)}>
                  {p.video_16x9 && (
                    <video className={styles.horizontal} src={urlMidia(p.video_16x9)} controls preload="metadata" playsInline />
                  )}
                  {p.video_9x16 && (
                    <video className={styles.vertical} src={urlMidia(p.video_9x16)} controls preload="metadata" playsInline />
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <div className={styles.chamada}>
        <p>Quer trabalhar com a gente?</p>
        <Link href="/cadastro" className="btn btn-primary">
          Fazer meu pedido
        </Link>
      </div>
    </section>
  );
}
