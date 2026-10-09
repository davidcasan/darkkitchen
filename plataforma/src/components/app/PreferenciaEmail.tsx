import { preferenciaEmailAction } from "@/app/actions/conta";
import { um } from "@/server/db";
import { PREFERENCIAS_EMAIL, type PreferenciaEmail as Preferencia } from "@/server/services/email";
import { Enviar, FormAcao } from "./FormAcao";

const EXPLICACAO: Record<Preferencia, string> = {
  todos: "Tudo o que aparece no sininho também chega por e-mail.",
  importantes:
    "Só o que pede uma ação sua ou envolve pagamento: pedidos para revisar ou produzir, Pix, créditos, prazos e respostas do atendimento.",
  nenhum: "Nada por e-mail. Os avisos continuam no sininho da plataforma.",
};

/** Escolha de quais avisos chegam por e-mail (tela Conta do cliente e da equipe). */
export function PreferenciaEmail({ usuarioId }: { usuarioId: number }) {
  const atual = um<{ email_avisos: Preferencia }>("SELECT email_avisos FROM usuarios WHERE id = ?", usuarioId)?.email_avisos ?? "todos";
  return (
    <section className="card">
      <h2>Avisos por e-mail</h2>
      <FormAcao action={preferenciaEmailAction}>
        <div className="stack" style={{ gap: 8, marginBottom: 14 }}>
          {(Object.keys(PREFERENCIAS_EMAIL) as Preferencia[]).map((p) => (
            <label
              key={p}
              style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", alignItems: "start", gap: 10, cursor: "pointer" }}
            >
              <input type="radio" name="email_avisos" value={p} defaultChecked={p === atual} style={{ marginTop: 4 }} />
              <span>
                <b>{PREFERENCIAS_EMAIL[p]}</b>
                <br />
                <small className="muted">{EXPLICACAO[p]}</small>
              </span>
            </label>
          ))}
        </div>
        <p className="hint" style={{ marginBottom: 12 }}>
          E-mails de segurança (recuperação de senha) sempre chegam.
        </p>
        <Enviar className="btn">Salvar</Enviar>
      </FormAcao>
    </section>
  );
}
