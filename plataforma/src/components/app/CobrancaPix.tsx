import { avisarPagamentoAction } from "@/app/actions/cliente";
import { formatarReais } from "@/domain/catalogo";
import { formatarData } from "@/server/datas";
import type { CobrancaPix as Cobranca } from "@/server/services/assinaturas";
import { qrCodeSvg } from "@/server/services/pix";
import { CopiarTexto } from "./CopiarTexto";
import { Enviar, FormAcao } from "./FormAcao";
import styles from "./CobrancaPix.module.css";

/** Cobrança Pix pendente: QR Code, código copia e cola e "Já paguei". */
export async function CobrancaPix({ cobranca }: { cobranca: Cobranca }) {
  const svg = await qrCodeSvg(cobranca.pix_payload);
  const vencida = !!cobranca.vence_em && cobranca.vence_em < new Date().toISOString().slice(0, 19).replace("T", " ");
  return (
    <div className={styles.cobranca}>
      <div className={styles.qr} role="img" aria-label="QR Code do Pix" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className={styles.info}>
        <span className="muted small">{cobranca.descricao}</span>
        <b className={styles.valor}>{formatarReais(cobranca.valor_centavos / 100)}</b>
        {cobranca.vence_em && (
          <small className={vencida ? styles.vencida : "muted"}>
            {vencida ? "Venceu em" : "Pague até"} {formatarData(cobranca.vence_em)}
          </small>
        )}
        <ol className={styles.passos}>
          <li>Abra o app do seu banco e escolha pagar com Pix.</li>
          <li>Leia o QR Code ou cole o código abaixo.</li>
          <li>Depois de pagar, clique em &quot;Já paguei&quot;. Conferimos e liberamos os créditos.</li>
        </ol>
        <CopiarTexto texto={cobranca.pix_payload} rotulo="Copiar código Pix" />
        {cobranca.aviso_pago_em ? (
          <p className="alerta alerta-ok" style={{ marginTop: 10 }}>
            Você avisou que pagou. Assim que confirmarmos o pagamento, os créditos entram e você recebe um aviso.
          </p>
        ) : (
          <FormAcao action={avisarPagamentoAction}>
            <input type="hidden" name="fatura" value={cobranca.id} />
            <div style={{ marginTop: 10 }}>
              <Enviar className="btn btn-primary" enviando="Avisando...">
                Já paguei
              </Enviar>
            </div>
          </FormAcao>
        )}
      </div>
    </div>
  );
}
