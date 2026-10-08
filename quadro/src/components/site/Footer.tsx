import Link from "next/link";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.grid}`}>
        <div>
          <p className={styles.brand}>Quadro</p>
          <p className={styles.tag}>Motion graphics sob demanda, feito por gente.</p>
        </div>
        <nav aria-label="Rodapé" className={styles.cols}>
          <div>
            <p className={styles.h}>Plataforma</p>
            <Link href="/#servicos">Serviços</Link>
            <Link href="/#planos">Planos</Link>
            <Link href="/#duvidas">Dúvidas</Link>
          </div>
          <div>
            <p className={styles.h}>Acesso</p>
            <Link href="/entrar">Área do cliente</Link>
            <Link href="/entrar">Área do artista</Link>
            <Link href="/cadastro">Criar conta</Link>
          </div>
        </nav>
      </div>
      <div className={`container ${styles.base}`}>© 2026 Quadro. Uso digital; TV e mídia nacional sob consulta.</div>
    </footer>
  );
}
