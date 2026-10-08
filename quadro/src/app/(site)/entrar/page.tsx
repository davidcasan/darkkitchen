import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/site/AuthForm";
import styles from "@/components/site/AuthForm.module.css";
import { areaDo, usuarioAtual } from "@/server/auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage() {
  const u = await usuarioAtual();
  if (u) redirect(areaDo(u.papel));
  return (
    <section className={`container ${styles.wrap}`}>
      <div className={styles.card}>
        <h1>Entrar</h1>
        <p>Clientes e equipe usam o mesmo acesso. Você vai direto para a sua área.</p>
        <AuthForm modo="entrar" />
      </div>
    </section>
  );
}
