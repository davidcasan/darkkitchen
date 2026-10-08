import type { Metadata } from "next";
import { removerArquivoMarcaAction, salvarMarcaAction } from "@/app/actions/cliente";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { formatarTamanho, urlArquivo } from "@/components/app/upload";
import { exigirUsuario } from "@/server/auth";
import { um } from "@/server/db";
import { arquivosDaMarca } from "@/server/services/arquivos";
import { CoresMarca, EnviarArquivoMarca } from "./MarcaCliente";

export const metadata: Metadata = { title: "Perfil da marca" };

export default async function MarcaPage() {
  const u = await exigirUsuario(["cliente"]);
  const arquivos = arquivosDaMarca(u.id);
  const marca = um<{ cores: string; observacoes: string }>("SELECT cores, observacoes FROM marcas WHERE usuario_id = ?", u.id);
  const cores = marca ? (JSON.parse(marca.cores) as string[]) : [];

  const grupo = (categoria: "logo" | "manual", titulo: string) => {
    const itens = arquivos.filter((a) => a.categoria === categoria);
    return (
      <section className="card">
        <h2>{titulo}</h2>
        {itens.length === 0 ? (
          <p className="muted small" style={{ marginBottom: 12 }}>
            Nenhum arquivo ainda.
          </p>
        ) : (
          <ul className="lista" style={{ marginBottom: 12 }}>
            {itens.map((a) => (
              <li key={a.id} className="row-between" style={{ padding: "10px 0" }}>
                <a className="arquivo" href={urlArquivo(a.id, true)}>
                  <span>{a.nome}</span>
                  <small className="muted">{formatarTamanho(a.tamanho)}</small>
                </a>
                <FormAcao action={removerArquivoMarcaAction} confirmar="Remover do perfil? Pedidos antigos continuam com o arquivo.">
                  <input type="hidden" name="arquivo" value={a.id} />
                  <Enviar className="link small" enviando="...">
                    Remover
                  </Enviar>
                </FormAcao>
              </li>
            ))}
          </ul>
        )}
        <EnviarArquivoMarca categoria={categoria} />
      </section>
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Perfil da marca</h1>
          <p>Tudo aqui aparece pronto no briefing dos próximos pedidos.</p>
        </div>
      </div>
      <div className="grid-2">
        {grupo("logo", "Logos")}
        {grupo("manual", "Manual e fontes")}
      </div>
      <section className="card" style={{ marginTop: 16 }}>
        <h2>Cores e observações</h2>
        <FormAcao action={salvarMarcaAction}>
          <CoresMarca iniciais={cores.length ? cores : ["#4B3BFF"]} />
          <div className="field">
            <label className="label" htmlFor="obs">
              Observações para a equipe <span className="opt">(opcional)</span>
            </label>
            <textarea
              id="obs"
              name="observacoes"
              className="txt"
              defaultValue={marca?.observacoes ?? ""}
              placeholder="Ex.: nunca usar o logo sobre fundo amarelo."
            />
          </div>
          <Enviar>Salvar</Enviar>
        </FormAcao>
      </section>
    </>
  );
}
