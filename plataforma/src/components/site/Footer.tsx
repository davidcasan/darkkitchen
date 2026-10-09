import Link from "next/link";
import { Marca } from "@/components/Marca";
import { EMAIL_CONTATO, mailto } from "@/domain/contato";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.grid}`}>
        <div>
          <Marca />
          <p className={styles.tag}>Motion graphics sem salão: da cozinha direto pro cliente, feito por gente.</p>
        </div>
        <nav aria-label="Rodapé" className={styles.cols}>
          <div>
            <p className={styles.h}>Estúdio</p>
            <Link href="/#servicos">Cardápio</Link>
            <Link href="/#planos">Planos</Link>
            <Link href="/#duvidas">Dúvidas</Link>
          </div>
          <div>
            <p className={styles.h}>Acesso</p>
            <Link href="/entrar">Área do cliente</Link>
            <Link href="/entrar">Área da equipe</Link>
            <Link href="/cadastro">Criar conta</Link>
          </div>
          <div className={styles.contato}>
            <p className={styles.h}>Fale com a gente</p>
            <a href={mailto(EMAIL_CONTATO, "Quero contratar")}>
              <small>Quero contratar</small>
              {EMAIL_CONTATO}
            </a>
            <Link href="/entrar">
              <small>Já sou cliente</small>
              Chat na área do cliente
            </Link>
          </div>
        </nav>
      </div>
      <div className={`container ${styles.base}`}>
        © 2026 Dark Kitchen Studio. Uso digital; TV e mídia nacional sob consulta.
      </div>
    </footer>
  );
}
