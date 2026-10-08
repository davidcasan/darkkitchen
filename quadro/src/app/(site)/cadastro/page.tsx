import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/site/AuthForm";
import styles from "@/components/site/AuthForm.module.css";
import { areaDo, usuarioAtual } from "@/server/auth";

export const metadata: Metadata = { title: "Criar conta" };

export default async function CadastroPage({ searchParams }: PageProps<"/cadastro">) {
  const u = await usuarioAtual();
  if (u) redirect(areaDo(u.papel));
  const { plano } = await searchParams;
  return (
    <section className={`container ${styles.wrap}`}>
      <div className={styles.card}>
        <h1>Criar conta</h1>
        <p>Escolha um plano e comece a pedir peças hoje.</p>
        <AuthForm modo="cadastro" planoInicial={typeof plano === "string" ? plano : undefined} />
      </div>
    </section>
  );
}
