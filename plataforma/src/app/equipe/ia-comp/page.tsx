import type { Metadata } from "next";
import Link from "next/link";
import { salvarIaCompAction } from "@/app/actions/admin";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { exigirUsuario } from "@/server/auth";
import { formatarDataHora } from "@/server/datas";
import {
  MODELO_IA,
  ROTULO_STATUS,
  chaveIaConfigurada,
  configIaComp,
  resumoIaComp,
  tokenMaquinaConfigurado,
  ultimaVisitaMaquina,
} from "@/server/services/iaComp";

export const metadata: Metadata = { title: "IA Comp" };

const numero = (n: number) => n.toLocaleString("pt-BR");

export default async function IaCompAdmin() {
  await exigirUsuario(["admin"]);
  const c = configIaComp();
  const r = resumoIaComp();
  const maquina = ultimaVisitaMaquina();
  const okChave = chaveIaConfigurada(), okToken = tokenMaquinaConfigurado();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>IA Comp</h1>
          <p>
            Quando um pedido chega, a IA sugere conceito, cenas com tempos, textos, paleta e trilha, e a plataforma monta um
            kit para o After Effects com os arquivos do cliente. Material interno: o cliente não vê. Cada pedido com IA
            gasta créditos da API da Anthropic ({MODELO_IA}), por isso fica desligado até você ligar.
          </p>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <section className="card">
          <h2>Configuração</h2>
          <FormAcao action={salvarIaCompAction}>
            <label className="check" style={{ marginBottom: 16 }}>
              <input type="checkbox" name="ativo" value="1" defaultChecked={c.ativo} />
              <span>
                <b>Ligada</b>: gerar automaticamente para cada pedido novo
              </span>
            </label>
            <div className="field">
              <span className="label">Como entregar a composição</span>
              <label className="check" style={{ marginBottom: 8 }}>
                <input type="radio" name="modo" value="kit" defaultChecked={c.modo === "kit"} />
                <span>
                  <b>Kit (JSON + script)</b>: o designer baixa o kit no pedido e roda o script no After dele.
                </span>
              </label>
              <label className="check">
                <input type="radio" name="modo" value="operaria" defaultChecked={c.modo === "operaria"} />
                <span>
                  <b>Máquina operária</b>: um computador com After monta sozinho e devolve o .aep e uma prévia.
                </span>
              </label>
            </div>
            <label className="check" style={{ marginBottom: 16 }}>
              <input type="checkbox" name="usarIA" value="1" defaultChecked={c.usarIA} />
              <span>
                <b>Usar a IA para as sugestões</b>. Desmarcado, o kit sai sem custo, só com o roteiro do cliente.
              </span>
            </label>
            <Enviar>Salvar</Enviar>
          </FormAcao>
        </section>

        <section className="card">
          <h2>Situação</h2>
          <ul className="lista">
            <li style={{ padding: "8px 0" }}>
              {okChave ? "✅" : "⚠️"} Chave da API da Anthropic {okChave ? "configurada" : "não configurada (ANTHROPIC_API_KEY no .env.local)"}
            </li>
            <li style={{ padding: "8px 0" }}>
              {okToken ? "✅" : "⚠️"} Token da máquina operária {okToken ? "configurado" : "não configurado (IA_COMP_TOKEN_MAQUINA)"}
            </li>
            <li style={{ padding: "8px 0" }}>
              Máquina operária: {maquina ? `último contato em ${formatarDataHora(maquina)}` : "nunca se conectou"}
            </li>
          </ul>
          <div className="grid-kpi" style={{ marginTop: 12 }}>
            <div className="kpi">
              <span>Pedidos processados</span>
              <b>{numero(r.total)}</b>
            </div>
            <div className="kpi">
              <span>Gasto estimado</span>
              <b>US$ {r.custoUsd.toFixed(2)}</b>
              <small>
                {numero(r.tokensEntrada)} tokens de entrada · {numero(r.tokensSaida)} de saída
              </small>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <h2>Últimos pedidos</h2>
        {r.recentes.length === 0 ? (
          <p className="muted small">Nenhum pedido passou pela IA Comp ainda.</p>
        ) : (
          <table className="extrato">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Situação</th>
                <th>Modo</th>
                <th className="num">Tokens</th>
                <th>Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {r.recentes.map((j) => (
                <tr key={j.id}>
                  <td>
                    <Link href={`/equipe/pedidos/${j.pedido_id}`}>{j.codigo}</Link> <small className="muted">{j.titulo}</small>
                  </td>
                  <td>
                    {ROTULO_STATUS[j.status]}
                    {j.erro ? <small className="muted"> · {j.erro}</small> : null}
                  </td>
                  <td>{j.modo === "operaria" ? "Máquina" : "Kit"}</td>
                  <td className="num">{numero(j.tokens_entrada + j.tokens_saida)}</td>
                  <td>{formatarDataHora(j.atualizado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
