import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/site/AuthForm";
import styles from "@/components/site/AuthForm.module.css";

export const metadata: Metadata = { title: "Criar conta" };

export default function CadastroPage() {
  return (
    <section className={`container ${styles.wrap}`}>
      <div className={styles.card}>
        <h1>Criar conta</h1>
        <p>Escolha um plano e comece a pedir peças hoje.</p>
        <Suspense>
          <AuthForm modo="cadastro" />
        </Suspense>
      </div>
    </section>
  );
}
