import styles from "./Marca.module.css";

/** Seta vermelha do logo, ao lado de "DARK" (traçado do arquivo original LOGO.svg). */
function Seta() {
  return (
    <svg viewBox="371.88 158.77 26.91 54.17" aria-hidden="true" className={styles.seta}>
      <path
        fill="currentColor"
        d="M371.88,158.77c12.4,12.67,17.44,16.79,26.91,26.46-10.51,10.51-14.83,15.34-26.91,27.71.91-17.94-.91-36.23,0-54.17Z"
      />
    </svg>
  );
}

/**
 * Logo: "DARK ▸ / KITCHEN" em duas linhas, branco, com a seta em vermelho.
 * Feito em texto + SVG (e não imagem) para ficar nítido em qualquer tamanho.
 */
export function Marca() {
  return (
    <span className={styles.marca} role="img" aria-label="Dark Kitchen Studio">
      <span className={styles.linha}>
        DARK
        <Seta />
      </span>
      <span className={styles.linha}>KITCHEN</span>
    </span>
  );
}
