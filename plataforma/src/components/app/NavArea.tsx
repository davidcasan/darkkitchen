"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icone, type NomeIcone } from "./Icone";
import styles from "./AppShell.module.css";

export interface ItemNav {
  href: string;
  rotulo: string;
  icone: NomeIcone;
  movel?: boolean; // aparece na barra inferior do celular
  destaque?: boolean;
  selo?: number; // contador (ex.: mensagens não lidas)
  grupo?: string; // id do grupo (submenu) no menu lateral; sem grupo, fica solto
}

export interface GrupoNav {
  id: string;
  rotulo: string;
  icone: NomeIcone;
}

const Selo = ({ n }: { n?: number }) =>
  n ? (
    <span className={styles.selo} aria-label={`${n} não lidas`}>
      {n > 9 ? "9+" : n}
    </span>
  ) : null;

/** O item ativo é o de endereço mais longo que combina com a página atual. */
function hrefAtivo(pathname: string, itens: ItemNav[]) {
  return itens
    .map((i) => i.href)
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
}

function LinkLateral({ i, atual, sub }: { i: ItemNav; atual?: string; sub?: boolean }) {
  return (
    <Link
      href={i.href}
      data-tour={`nav:${i.href}`}
      className={sub ? `${styles.navLink} ${styles.navSub}` : styles.navLink}
      data-destaque={i.destaque ?? false}
      aria-current={i.href === atual ? "page" : undefined}
    >
      {!sub && <Icone nome={i.icone} />}
      {i.rotulo}
      <Selo n={i.selo} />
    </Link>
  );
}

/** Submenu recolhível; abre sozinho quando a página atual está nele. */
function GrupoLateral({ g, itens, atual }: { g: GrupoNav; itens: ItemNav[]; atual?: string }) {
  const contemAtual = itens.some((i) => i.href === atual);
  const [aberto, setAberto] = useState(contemAtual);
  const [atualVisto, setAtualVisto] = useState(atual);
  if (atual !== atualVisto) {
    // Mudou de página: o grupo da nova página abre; os outros ficam como o usuário deixou.
    setAtualVisto(atual);
    if (contemAtual && !aberto) setAberto(true);
  }
  const total = itens.reduce((s, i) => s + (i.selo ?? 0), 0);
  const idLista = `grupo-${g.id}`;
  return (
    <li>
      <button
        type="button"
        className={styles.navGrupo}
        data-ativo={contemAtual}
        aria-expanded={aberto}
        aria-controls={idLista}
        onClick={() => setAberto(!aberto)}
      >
        <Icone nome={g.icone} />
        {g.rotulo}
        {!aberto && <Selo n={total} />}
        <span className={styles.navSeta} aria-hidden="true">
          <Icone nome="seta" tamanho={16} />
        </span>
      </button>
      {aberto && (
        <ul className={styles.navSubLista} id={idLista}>
          {itens.map((i) => (
            <li key={i.href}>
              <LinkLateral i={i} atual={atual} sub />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function NavLateral({ itens, grupos = [] }: { itens: ItemNav[]; grupos?: GrupoNav[] }) {
  const atual = hrefAtivo(usePathname(), itens);
  // Na ordem dos itens: os soltos aparecem onde estão; cada grupo, no lugar do seu primeiro item.
  const vistos = new Set<string>();
  return (
    <ul className={styles.navLista}>
      {itens.map((i) => {
        const g = i.grupo ? grupos.find((x) => x.id === i.grupo) : undefined;
        if (!g)
          return (
            <li key={i.href}>
              <LinkLateral i={i} atual={atual} />
            </li>
          );
        if (vistos.has(g.id)) return null;
        vistos.add(g.id);
        return <GrupoLateral key={g.id} g={g} itens={itens.filter((x) => x.grupo === g.id)} atual={atual} />;
      })}
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
            data-tour={`nav:${i.href}`}
            data-destaque={i.destaque ?? false}
            aria-current={i.href === atual ? "page" : undefined}
          >
            <span className={styles.inferiorIcone}>
              <Icone nome={i.icone} tamanho={i.destaque ? 22 : 20} />
              <Selo n={i.selo} />
            </span>
            <small>{i.rotulo}</small>
          </Link>
        ))}
    </nav>
  );
}
