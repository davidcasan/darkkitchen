"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { cadastrarAction, entrarAction } from "@/app/actions/conta";
import { Enviar } from "@/components/app/FormAcao";
import { formatarReais } from "@/domain/catalogo";
import type { Plano } from "@/domain/precos";
import styles from "./AuthForm.module.css";

export function AuthForm({
  modo,
  planoInicial,
  planos = [],
}: {
  modo: "entrar" | "cadastro";
  planoInicial?: string;
  planos?: Plano[];
}) {
  const cadastro = modo === "cadastro";
  const [estado, acao] = useActionState(cadastro ? cadastrarAction : entrarAction, null);
  const [metodo, setMetodo] = useState<"cartao" | "pix">("cartao");
  const plano = planos.some((p) => p.id === planoInicial)
    ? planoInicial
    : (planos.find((p) => p.destaque) ?? planos[0])?.id;

  return (
    <form className={styles.form} action={acao}>
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
          minLength={cadastro ? 8 : undefined}
          required
        />
      </label>
      {cadastro && (
        <>
          <label className={styles.field}>
            <span>Plano</span>
            <select className={styles.txt} name="plano" defaultValue={plano}>
              {planos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} · {p.creditosMes} créditos · {formatarReais(p.precoMes)}/mês
                </option>
              ))}
            </select>
          </label>
          <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: 0 }}>
            <span>Pagamento</span>
            <div className="chips">
              <label className="chip" aria-pressed={metodo === "cartao"}>
                <input type="radio" name="metodo" value="cartao" checked={metodo === "cartao"} onChange={() => setMetodo("cartao")} className="sr-only" />
                Cartão de crédito
              </label>
              <label className="chip" aria-pressed={metodo === "pix"}>
                <input type="radio" name="metodo" value="pix" checked={metodo === "pix"} onChange={() => setMetodo("pix")} className="sr-only" />
                Pix
              </label>
            </div>
          </fieldset>
          {metodo === "cartao" && (
            <label className={styles.field}>
              <span>
                Últimos 4 dígitos do cartão <small className="muted">(simulação)</small>
              </span>
              <input className={styles.txt} name="final" inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="0000" required />
            </label>
          )}
          <p className="hint">Pagamento simulado nesta versão: nenhuma cobrança real é feita.</p>
        </>
      )}

      <Enviar enviando={cadastro ? "Criando conta..." : "Entrando..."}>{cadastro ? "Assinar e criar conta" : "Entrar"}</Enviar>

      {estado?.erro && (
        <p className="alerta alerta-erro" role="alert">
          {estado.erro}
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
