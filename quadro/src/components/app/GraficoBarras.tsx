import styles from "./GraficoBarras.module.css";

// Gráfico de barras de uma série (ex.: faturamento por mês). Uma série só:
// o título nomeia a série, sem legenda. O valor aparece ao passar o mouse ou
// focar a barra; a tabela abaixo do gráfico traz todos os números.

export function GraficoBarras({
  dados,
  formatar,
  rotuloAcessivel,
}: {
  dados: { rotulo: string; detalhe: string; valor: number }[];
  formatar: (v: number) => string;
  rotuloAcessivel: string;
}) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return (
    <div className={styles.grafico} role="img" aria-label={rotuloAcessivel}>
      <div className={styles.area}>
        {dados.map((d) => (
          <div key={d.detalhe} className={styles.coluna} tabIndex={0} aria-label={`${d.detalhe}: ${formatar(d.valor)}`}>
            <span className={styles.dica} role="tooltip">
              <b>{formatar(d.valor)}</b>
              <small>{d.detalhe}</small>
            </span>
            <span
              className={styles.barra}
              data-vazia={d.valor === 0}
              style={{ height: `${Math.max(d.valor > 0 ? 2 : 0, (d.valor / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className={styles.eixo} aria-hidden="true">
        {dados.map((d) => (
          <span key={d.detalhe}>{d.rotulo}</span>
        ))}
      </div>
    </div>
  );
}
