"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { cadastrarAction, entrarAction } from "@/app/actions/conta";
import { Enviar } from "@/components/app/FormAcao";
import { formatarReais } from "@/domain/catalogo";
import { PLANO_PERSONALIZADO, type Plano } from "@/domain/precos";
import styles from "./AuthForm.module.css";

export function AuthForm({
  modo,
  planoInicial,
  planos = [],
  pix = false,
  cartao = true,
}: {
  modo: "entrar" | "cadastro";
  planoInicial?: string;
  planos?: Plano[];
  pix?: boolean; // Pix configurado pelo admin
  cartao?: boolean; // cartão aceito (desligado por enquanto: só Pix)
}) {
  const cadastro = modo === "cadastro";
  const [estado, acao] = useActionState(cadastro ? cadastrarAction : entrarAction, null);
  const [metodo, setMetodo] = useState<"cartao" | "pix">(cartao ? "cartao" : "pix");
  const inicial =
    planoInicial === PLANO_PERSONALIZADO || planos.some((p) => p.id === planoInicial)
      ? planoInicial
      : (planos.find((p) => p.destaque) ?? planos[0])?.id;
  const [plano, setPlano] = useState(inicial);
  const personalizado = plano === PLANO_PERSONALIZADO;

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
            <select className={styles.txt} name="plano" value={plano} onChange={(e) => setPlano(e.target.value)}>
              {planos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} · {p.creditosMes} créditos · {formatarReais(p.precoMes)}/mês
                </option>
              ))}
              <option value={PLANO_PERSONALIZADO}>Personalizado · créditos e valor combinados com você</option>
            </select>
          </label>
          {personalizado && (
            <p className={styles.dica}>
              Sem pagamento agora. Depois de criar a conta, você conversa com a gente pelo chat da sua área e combinamos os créditos e
              o valor. Quando o plano for liberado, aparece um QR Code de Pix; os créditos entram assim que confirmarmos o pagamento.
            </p>
          )}
          {!personalizado && !cartao && (
            <>
              <input type="hidden" name="metodo" value="pix" />
              <p className="hint">
                {pix
                  ? "Pagamento por Pix: depois de criar a conta, aparece o QR Code. Os créditos entram assim que confirmarmos o pagamento."
                  : "A contratação está temporariamente indisponível. Fale com a gente pelo contato no rodapé."}
              </p>
            </>
          )}
          {!personalizado && cartao && (
            <>
              <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: 0 }}>
                <span>Pagamento</span>
                <div className="chips">
                  <label className="chip" aria-pressed={metodo === "cartao"}>
                    <input type="radio" name="metodo" value="cartao" checked={metodo === "cartao"} onChange={() => setMetodo("cartao")} className="sr-only" />
                    Cartão de crédito
                  </label>
                  {pix && (
                    <label className="chip" aria-pressed={metodo === "pix"}>
                      <input type="radio" name="metodo" value="pix" checked={metodo === "pix"} onChange={() => setMetodo("pix")} className="sr-only" />
                      Pix
                    </label>
                  )}
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
              <p className="hint">
                {metodo === "pix"
                  ? "Pix: depois de criar a conta, aparece o QR Code. Os créditos entram assim que confirmarmos o pagamento."
                  : "Cartão simulado nesta fase de testes: nenhuma cobrança real é feita."}
              </p>
            </>
          )}
        </>
      )}

      {!cadastro && (
        <p className={styles.dica} style={{ margin: "-4px 0 0" }}>
          <Link href="/esqueci-senha">Esqueci minha senha</Link>
        </p>
      )}

      <Enviar enviando={cadastro ? "Criando conta..." : "Entrando..."}>{cadastro ? (personalizado ? "Criar conta" : "Assinar e criar conta") : "Entrar"}</Enviar>

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
