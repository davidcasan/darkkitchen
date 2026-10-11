import Link from "next/link";
import { PAPEIS } from "@/domain/pedido";
import type { Usuario } from "@/server/auth";
import { voltarAoAdminAction } from "@/app/actions/admin";
import { sairAction } from "@/app/actions/conta";
import { Marca } from "@/components/Marca";
import { Icone } from "./Icone";
import { type GrupoNav, type ItemNav, NavInferior, NavLateral } from "./NavArea";
import styles from "./AppShell.module.css";

// Moldura das áreas logadas: menu lateral no computador; barra superior e
// barra de abas inferior no celular (padrão que o app mobile vai repetir).

export function AppShell({
  usuario,
  itens,
  grupos,
  raiz,
  naoLidas,
  resumo,
  comoAdmin,
  children,
}: {
  usuario: Usuario;
  itens: ItemNav[];
  grupos?: GrupoNav[]; // submenus do menu lateral
  raiz: string;
  naoLidas: number;
  resumo?: React.ReactNode;
  comoAdmin?: string | null; // nome do admin, quando ele está acessando esta conta
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell} data-como-admin={Boolean(comoAdmin)}>
      {comoAdmin && (
        <div className={styles.faixaAdmin} role="status">
          <span>
            {comoAdmin}, você está acessando como <b>{usuario.nome}</b> ({PAPEIS[usuario.papel]}). Tudo o que fizer fica em nome
            desta conta.
          </span>
          <form action={voltarAoAdminAction}>
            <button type="submit" className="btn btn-sm">
              Voltar ao admin
            </button>
          </form>
        </div>
      )}
      <aside className={styles.lateral}>
        <Link href={raiz} className={styles.brand} aria-label="Dark Kitchen Studio, início">
          <Marca />
        </Link>
        <nav aria-label="Principal">
          <NavLateral itens={itens} grupos={grupos} />
        </nav>
        {resumo && (
          <div className={styles.resumo} data-tour="saldo">
            {resumo}
          </div>
        )}
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
        <Link href={raiz} className={styles.brand} aria-label="Dark Kitchen Studio, início">
          <Marca />
        </Link>
        <div className={styles.topoAcoes}>
          {resumo && (
            <div className={styles.topoResumo} data-tour="saldo">
              {resumo}
            </div>
          )}
          <Link href={raiz + "#novidades"} className={styles.sino} data-tour="sino" aria-label={`Notificações: ${naoLidas} novas`}>
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
