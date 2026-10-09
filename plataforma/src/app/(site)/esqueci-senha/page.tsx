import type { Metadata } from "next";
import Link from "next/link";
import { pedirRecuperacaoAction } from "@/app/actions/conta";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import styles from "@/components/site/AuthForm.module.css";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function EsqueciSenha() {
  return (
    <section className={`container ${styles.wrap}`}>
      <div className={styles.card}>
        <h1>Esqueci minha senha</h1>
        <p>Digite o e-mail da sua conta. Enviamos um link para você criar uma senha nova.</p>
        <FormAcao action={pedirRecuperacaoAction} className={styles.form}>
          <label className={styles.field}>
            <span>E-mail</span>
            <input className={styles.txt} name="email" type="email" autoComplete="email" required />
          </label>
          <Enviar enviando="Enviando...">Enviar link</Enviar>
        </FormAcao>
        <p className={styles.troca}>
          Lembrou? <Link href="/entrar">Entrar</Link>
        </p>
      </div>
    </section>
  );
}
