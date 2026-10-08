import type { Metadata } from "next";
import { alterarSenhaAction, sairAction } from "@/app/actions/conta";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { PAPEIS } from "@/domain/pedido";
import { exigirUsuario } from "@/server/auth";

export const metadata: Metadata = { title: "Conta" };

export default async function ContaEquipe() {
  const u = await exigirUsuario(["designer", "gerente", "diretor", "admin"]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Conta</h1>
          <p>
            {u.nome} · {PAPEIS[u.papel]}
            {u.senior ? " sênior" : ""} · {u.email}
          </p>
        </div>
      </div>
      <div className="grid-2">
        <section className="card">
          <h2>Alterar senha</h2>
          <FormAcao action={alterarSenhaAction}>
            <div className="field">
              <label className="label" htmlFor="atual">
                Senha atual
              </label>
              <input id="atual" name="atual" type="password" className="txt" autoComplete="current-password" required />
            </div>
            <div className="field">
              <label className="label" htmlFor="nova">
                Nova senha
              </label>
              <input id="nova" name="nova" type="password" className="txt" autoComplete="new-password" minLength={8} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="confirma">
                Confirme a nova senha
              </label>
              <input id="confirma" name="confirma" type="password" className="txt" autoComplete="new-password" minLength={8} required />
            </div>
            <Enviar>Salvar nova senha</Enviar>
          </FormAcao>
        </section>
        <section className="card">
          <h2>Sair</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>
            Encerra a sessão neste navegador.
          </p>
          <form action={sairAction}>
            <button type="submit" className="btn btn-danger">
              Sair da conta
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
