"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./Header.module.css";

const LINKS = [
  { href: "/#servicos", label: "Serviços" },
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#planos", label: "Planos" },
  { href: "/#duvidas", label: "Dúvidas" },
];

export function Header() {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberto]);

  return (
    <header className={styles.header} data-open={aberto}>
      <div className={`container ${styles.bar}`}>
        <Link href="/" className={styles.brand} onClick={() => setAberto(false)}>
          <i aria-hidden="true" />
          Quadro
        </Link>

        <nav id="menu-principal" className={styles.nav} aria-label="Principal">
          <ul>
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setAberto(false)}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className={styles.acoes}>
            <Link href="/entrar" className="btn" onClick={() => setAberto(false)}>
              Entrar
            </Link>
            <Link href="/cadastro" className="btn btn-primary" onClick={() => setAberto(false)}>
              Começar agora
            </Link>
          </div>
        </nav>

        <button
          type="button"
          className={styles.toggle}
          aria-expanded={aberto}
          aria-controls="menu-principal"
          onClick={() => setAberto((v) => !v)}
        >
          <span className="sr-only">{aberto ? "Fechar menu" : "Abrir menu"}</span>
          <span aria-hidden="true" className={styles.burger} />
        </button>
      </div>
    </header>
  );
}
