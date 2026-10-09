import type { Metadata } from "next";
import Link from "next/link";
import { redefinirSenhaAction } from "@/app/actions/conta";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import styles from "@/components/site/AuthForm.module.css";
import { conferirLink } from "@/server/services/recuperacao";

export const metadata: Metadata = { title: "Criar nova senha", robots: { index: false } };

export default async function RedefinirSenha({ searchParams }: PageProps<"/redefinir-senha">) {
  const { token } = await searchParams;
  const codigo = typeof token === "string" ? token : "";
  const conta = conferirLink(codigo);

  return (
    <section className={`container ${styles.wrap}`}>
      <div className={styles.card}>
        {!conta ? (
          <>
            <h1>Link vencido</h1>
            <p>Este link não vale mais: ele dura 1 hora e só pode ser usado uma vez. Peça um novo.</p>
            <p className={styles.troca}>
              <Link href="/esqueci-senha" className="btn btn-primary">
                Pedir novo link
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1>Criar nova senha</h1>
            <p>
              Conta de {conta.nome.split(" ")[0]} ({conta.email}). Depois de salvar, você entra com a senha nova em qualquer
              aparelho.
            </p>
            <FormAcao action={redefinirSenhaAction} className={styles.form}>
              <input type="hidden" name="token" value={codigo} />
              <label className={styles.field}>
                <span>Nova senha</span>
                <input className={styles.txt} name="nova" type="password" autoComplete="new-password" minLength={8} required />
              </label>
              <label className={styles.field}>
                <span>Confirme a nova senha</span>
                <input className={styles.txt} name="confirma" type="password" autoComplete="new-password" minLength={8} required />
              </label>
              <Enviar enviando="Salvando...">Salvar nova senha</Enviar>
            </FormAcao>
          </>
        )}
      </div>
    </section>
  );
}
