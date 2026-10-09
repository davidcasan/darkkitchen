import styles from "./Stage.module.css";

// Composição animada do hero: uma tela com formas em movimento e uma
// linha do tempo com keyframes, ecoando a navegação do briefing.
export function Stage() {
  return (
    <div className={styles.stage} aria-hidden="true">
      <div className={styles.frame}>
        <span className={styles.label}>CENA 02 · 9:16</span>
        <div className={styles.shapes}>
          <em className={styles.diamond} />
          <em className={styles.bar1} />
          <em className={styles.bar2} />
          <em className={styles.dot} />
        </div>
        <div className={styles.caption}>
          <b>Coleção Verão</b>
          <span>até 30% off</span>
        </div>
      </div>
      <div className={styles.timeline}>
        <div className={styles.track}>
          <i style={{ left: "6%" }} />
          <i style={{ left: "30%" }} />
          <i style={{ left: "52%" }} />
          <i style={{ left: "78%" }} />
          <span className={styles.head} />
        </div>
        <div className={styles.tc}>
          <span>00:00</span>
          <span>00:15</span>
        </div>
      </div>
    </div>
  );
}
