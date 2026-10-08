"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PLANOS } from "@/domain/catalogo";
import styles from "./AuthForm.module.css";

// Somente interface por enquanto. A autenticação real (API + sessão por token)
// entra na fase 2; o mesmo login vai levar cliente ou artista à sua área.
export function AuthForm({ modo }: { modo: "entrar" | "cadastro" }) {
  const params = useSearchParams();
  const planoInicial = PLANOS.some((p) => p.id === params.get("plano")) ? params.get("plano")! : "crescimento";
  const [aviso, setAviso] = useState(false);
  const cadastro = modo === "cadastro";

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        setAviso(true);
      }}
    >
      {cadastro && (
        <>
          <label className={styles.field}>
            <span>Seu nome</span>
            <input className={styles.txt} name="nome" autoComplete="name" required />
          </label>
          <label className={styles.field}>
            <span>Empresa ou marca</span>
            <input className={styles.txt} name="empresa" autoComplete="organization" required />
          </label>
        </>
      )}
      <label className={styles.field}>
        <span>E-mail</span>
        <input className={styles.txt} name="email" type="email" autoComplete="email" inputMode="email" required />
      </label>
      <label className={styles.field}>
        <span>Senha</span>
        <input
          className={styles.txt}
          name="senha"
          type="password"
          autoComplete={cadastro ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </label>
      {cadastro && (
        <label className={styles.field}>
          <span>Plano</span>
          <select className={styles.txt} name="plano" defaultValue={planoInicial}>
            {PLANOS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} · {p.creditosMes} créditos/mês
              </option>
            ))}
          </select>
        </label>
      )}

      <button type="submit" className="btn btn-primary">
        {cadastro ? "Criar conta" : "Entrar"}
      </button>

      {aviso && (
        <p className={styles.aviso} role="status">
          {cadastro ? "O cadastro" : "O login"} ainda não está ativo. Ele entra na próxima fase do desenvolvimento.
        </p>
      )}

      <p className={styles.troca}>
        {cadastro ? (
          <>
            Já tem conta? <Link href="/entrar">Entrar</Link>
          </>
        ) : (
          <>
            Ainda não tem conta? <Link href="/cadastro">Criar conta</Link>
          </>
        )}
      </p>
    </form>
  );
}
