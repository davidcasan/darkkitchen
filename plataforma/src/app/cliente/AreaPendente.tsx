import { gerarPixAction } from "@/app/actions/cliente";
import { sairAction } from "@/app/actions/conta";
import { PainelAtendimento } from "@/components/app/Atendimento";
import { CobrancaPix } from "@/components/app/CobrancaPix";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { formatarReais } from "@/domain/catalogo";
import { PLANO_PERSONALIZADO } from "@/domain/precos";
import type { Usuario } from "@/server/auth";
import { type Assinatura, cobrancasPixDo, planoDaAssinatura } from "@/server/services/assinaturas";

/**
 * Conta pendente: esperando o 1º pagamento por Pix ou a negociação do plano
 * Personalizado. O cliente só vê a cobrança (quando houver) e o chat do atendimento.
 */
export function AreaPendente({ usuario, assinatura }: { usuario: Usuario; assinatura: Assinatura }) {
  const plano = planoDaAssinatura(assinatura);
  const personalizado = assinatura.plano_id === PLANO_PERSONALIZADO;
  const cobrancas = cobrancasPixDo(usuario.id);
  const negociando = personalizado && !plano;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{negociando ? "Vamos montar seu plano" : "Falta só o pagamento"}</h1>
          <p>
            {negociando
              ? "Conte pelo chat abaixo o que você precisa: tipos de peça, quantidade por mês e prazos. Combinamos os créditos e o valor com você."
              : `Plano ${plano?.nome}: ${plano?.creditosMes} créditos por ${formatarReais(plano?.precoMes ?? 0)}/mês. Assim que confirmarmos o pagamento, sua área completa é liberada com os créditos.`}
          </p>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <section className="card">
          {negociando ? (
            <>
              <h2>Como funciona</h2>
              <ol className="small" style={{ paddingLeft: 18, display: "grid", gap: 6, color: "var(--muted)" }}>
                <li>Você conta pelo chat o que precisa.</li>
                <li>Combinamos a quantidade de créditos por mês e o valor.</li>
                <li>Liberamos o seu plano e aparece aqui um QR Code de Pix.</li>
                <li>Você paga, nós confirmamos, e os créditos entram para você começar a pedir.</li>
              </ol>
            </>
          ) : cobrancas.length ? (
            <>
              <h2>Pague com Pix</h2>
              <div className="stack">
                {cobrancas.map((c) => (
                  <CobrancaPix key={c.id} cobranca={c} />
                ))}
              </div>
            </>
          ) : (
            <>
              <h2>Pagamento</h2>
              <p className="muted small" style={{ marginBottom: 12 }}>
                Não há nenhum Pix aberto para o seu plano. Gere um novo ou fale com a gente pelo chat.
              </p>
              <FormAcao action={gerarPixAction}>
                <Enviar>Gerar Pix</Enviar>
              </FormAcao>
            </>
          )}
          <form action={sairAction} style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <button type="submit" className="link small">
              Sair da conta
            </button>
          </form>
        </section>

        <PainelAtendimento alvo={{}} visao="cliente" titulo="Atendimento" embutido />
      </div>
    </>
  );
}
