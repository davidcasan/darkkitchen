import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/site/AuthForm";
import styles from "@/components/site/AuthForm.module.css";

export const metadata: Metadata = { title: "Entrar" };

export default function EntrarPage() {
  return (
    <section className={`container ${styles.wrap}`}>
      <div className={styles.card}>
        <h1>Entrar</h1>
        <p>Clientes e artistas usam o mesmo acesso. Você vai direto para a sua área.</p>
        <Suspense>
          <AuthForm modo="entrar" />
        </Suspense>
      </div>
    </section>
  );
}
