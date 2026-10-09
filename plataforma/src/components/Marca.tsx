import styles from "./Marca.module.css";

/**
 * Degradê da chama, definido uma única vez na página (no layout raiz). Se cada
 * chama tivesse o seu, a cópia dentro do menu escondido no celular "levaria" o
 * degradê junto e as outras chamas ficariam invisíveis.
 */
export function DefinicoesMarca() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <defs>
        <linearGradient id="dk-brasa" x1="0" y1="1" x2="0.6" y2="0">
          <stop offset="0" stopColor="#ff4d2e" />
          <stop offset="1" stopColor="#ffb547" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Símbolo: chama estilizada, em degradê de brasa. */
export function Chama({ tamanho = 22 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden="true" className={styles.chama}>
      <path
        fill="url(#dk-brasa)"
        d="M12.6 1.8c.4 3-1 4.8-2.6 6.5-1.6 1.7-3.3 3.5-3.3 6.6A5.4 5.4 0 0 0 12 20.5a5.6 5.6 0 0 0 5.5-5.6c0-2.6-1.3-4.3-2.2-5.4-.2 1.6-.9 2.6-1.9 3.1.4-3.4-.2-7.1-.8-10.8Z"
      />
      <path fill="#0c0a09" opacity=".55" d="M12.2 13.4c.9 1.2 1.9 2.1 1.9 3.6a2.1 2.1 0 1 1-4.2 0c0-1.5 1.2-2.4 2.3-3.6Z" />
    </svg>
  );
}

/** Marca completa: chama + "Dark Kitchen" + "Studio". */
export function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <span className={styles.marca}>
      <Chama />
      <span className={styles.nome}>
        Dark Kitchen
        {!compacta && <small>Studio</small>}
      </span>
    </span>
  );
}
