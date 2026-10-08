"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone, type NomeIcone } from "./Icone";
import styles from "./AppShell.module.css";

export interface ItemNav {
  href: string;
  rotulo: string;
  icone: NomeIcone;
  movel?: boolean; // aparece na barra inferior do celular
  destaque?: boolean;
}

/** O item ativo é o de endereço mais longo que combina com a página atual. */
function hrefAtivo(pathname: string, itens: ItemNav[]) {
  return itens
    .map((i) => i.href)
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
}

export function NavLateral({ itens }: { itens: ItemNav[] }) {
  const atual = hrefAtivo(usePathname(), itens);
  return (
    <ul className={styles.navLista}>
      {itens.map((i) => (
        <li key={i.href}>
          <Link
            href={i.href}
            className={styles.navLink}
            data-destaque={i.destaque ?? false}
            aria-current={i.href === atual ? "page" : undefined}
          >
            <Icone nome={i.icone} />
            {i.rotulo}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function NavInferior({ itens }: { itens: ItemNav[] }) {
  const atual = hrefAtivo(usePathname(), itens);
  return (
    <nav className={styles.inferior} aria-label="Navegação">
      {itens
        .filter((i) => i.movel)
        .map((i) => (
          <Link
            key={i.href}
            href={i.href}
            data-destaque={i.destaque ?? false}
            aria-current={i.href === atual ? "page" : undefined}
          >
            <span className={styles.inferiorIcone}>
              <Icone nome={i.icone} tamanho={i.destaque ? 22 : 20} />
            </span>
            <small>{i.rotulo}</small>
          </Link>
        ))}
    </nav>
  );
}
