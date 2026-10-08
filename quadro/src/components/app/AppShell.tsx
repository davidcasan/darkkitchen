import Link from "next/link";
import { PAPEIS } from "@/domain/pedido";
import type { Usuario } from "@/server/auth";
import { sairAction } from "@/app/actions/conta";
import { Icone } from "./Icone";
import { type ItemNav, NavInferior, NavLateral } from "./NavArea";
import styles from "./AppShell.module.css";

// Moldura das áreas logadas: menu lateral no computador; barra superior e
// barra de abas inferior no celular (padrão que o app mobile vai repetir).

export function AppShell({
  usuario,
  itens,
  raiz,
  naoLidas,
  resumo,
  children,
}: {
  usuario: Usuario;
  itens: ItemNav[];
  raiz: string;
  naoLidas: number;
  resumo?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <aside className={styles.lateral}>
        <Link href={raiz} className={styles.brand}>
          <i aria-hidden="true" />
          Quadro
        </Link>
        <nav aria-label="Principal">
          <NavLateral itens={itens} />
        </nav>
        {resumo && <div className={styles.resumo}>{resumo}</div>}
        <div className={styles.perfil}>
          <div>
            <b>{usuario.nome}</b>
            <small>{usuario.empresa ?? PAPEIS[usuario.papel]}</small>
          </div>
          <form action={sairAction}>
            <button type="submit" className={styles.sair} title="Sair" aria-label="Sair">
              <Icone nome="sair" tamanho={18} />
            </button>
          </form>
        </div>
      </aside>

      <header className={styles.topo}>
        <Link href={raiz} className={styles.brand}>
          <i aria-hidden="true" />
          Quadro
        </Link>
        <div className={styles.topoAcoes}>
          {resumo && <div className={styles.topoResumo}>{resumo}</div>}
          <Link href={raiz + "#novidades"} className={styles.sino} aria-label={`Notificações: ${naoLidas} novas`}>
            <Icone nome="sino" />
            {naoLidas > 0 && <span>{naoLidas > 9 ? "9+" : naoLidas}</span>}
          </Link>
        </div>
      </header>

      <main className={styles.conteudo}>{children}</main>

      <NavInferior itens={itens} />
    </div>
  );
}
