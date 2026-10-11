import type { Metadata } from "next";
import { TutorialConteudo } from "@/components/app/Tutorial";
import { exigirUsuario } from "@/server/auth";
import styles from "@/components/app/Tutorial.module.css";

export const metadata: Metadata = { title: "Tutorial" };

// O tutorial do primeiro acesso, sempre disponível para rever.
export default async function TutorialCliente() {
  await exigirUsuario(["cliente"]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tutorial</h1>
          <p>Como funciona a plataforma e como preencher cada etapa do pedido.</p>
        </div>
      </div>
      <div className={styles.pagina}>
        <TutorialConteudo />
      </div>
    </>
  );
}
