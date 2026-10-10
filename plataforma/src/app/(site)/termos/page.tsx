import type { Metadata } from "next";
import { Markdown } from "@/components/Markdown";
import { formatarData } from "@/server/datas";
import { termosAtuais } from "@/server/services/termos";
import styles from "./termos.module.css";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Termos de Uso da plataforma Dark Kitchen Studio.",
};

export default function TermosPage() {
  const t = termosAtuais();
  return (
    <section className={`container ${styles.pagina}`}>
      <span className="eyebrow">Dark Kitchen Studio</span>
      <h1>Termos de Uso</h1>
      <p className={styles.versao}>
        Versão {t.versao}
        {t.atualizado_em ? ` · atualizada em ${formatarData(t.atualizado_em)}` : ""}
      </p>
      <Markdown texto={t.texto} className={styles.texto} />
    </section>
  );
}
