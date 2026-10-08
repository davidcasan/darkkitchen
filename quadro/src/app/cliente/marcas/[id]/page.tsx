import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removerArquivoMarcaAction, removerMarcaAction, salvarMarcaAction } from "@/app/actions/cliente";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { formatarTamanho, urlArquivo } from "@/components/app/upload";
import { exigirUsuario } from "@/server/auth";
import { ErroNegocio } from "@/server/db";
import { type MarcaComArquivos, listarMarcas, marcaParaUsuario } from "@/server/services/marcas";
import { CoresMarca, EnviarArquivoMarca } from "../MarcaCliente";

export const metadata: Metadata = { title: "Marca" };

export default async function MarcaPage({ params }: PageProps<"/cliente/marcas/[id]">) {
  const u = await exigirUsuario(["cliente"]);
  const { id } = await params;
  let m: MarcaComArquivos;
  try {
    m = marcaParaUsuario(Number(id), u);
  } catch (e) {
    if (e instanceof ErroNegocio) notFound();
    throw e;
  }
  const unica = listarMarcas(u.id).length <= 1;

  const grupo = (categoria: "logo" | "manual", titulo: string) => {
    const itens = m.arquivos.filter((a) => a.categoria === categoria);
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
                <FormAcao action={removerArquivoMarcaAction} confirmar="Remover da marca? Pedidos antigos continuam com o arquivo.">
                  <input type="hidden" name="arquivo" value={a.id} />
                  <Enviar className="link small" enviando="...">
                    Remover
                  </Enviar>
                </FormAcao>
              </li>
            ))}
          </ul>
        )}
        <EnviarArquivoMarca categoria={categoria} marcaId={m.id} />
      </section>
    );
  };

  return (
    <>
      <Link href="/cliente/marcas" className="link small">
        ← Marcas
      </Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <h1>{m.nome}</h1>
          <p>
            {m.pedidos} {m.pedidos === 1 ? "pedido" : "pedidos"} com esta marca. Tudo aqui aparece pronto no briefing quando você
            escolher esta marca.
          </p>
        </div>
        <Link href="/cliente/pedidos/novo" className="btn btn-primary">
          Novo pedido
        </Link>
      </div>

      <div className="grid-2">
        {grupo("logo", "Logos")}
        {grupo("manual", "Manual e fontes")}
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Nome, cores e observações</h2>
        <FormAcao action={salvarMarcaAction}>
          <input type="hidden" name="marca" value={m.id} />
          <div className="field">
            <label className="label" htmlFor="m-nome">
              Nome da marca
            </label>
            <input id="m-nome" name="nome" className="txt" defaultValue={m.nome} required minLength={2} />
          </div>
          <CoresMarca iniciais={m.cores.length ? m.cores : ["#4B3BFF"]} />
          <div className="field">
            <label className="label" htmlFor="obs">
              Observações para a equipe <span className="opt">(opcional)</span>
            </label>
            <textarea
              id="obs"
              name="observacoes"
              className="txt"
              defaultValue={m.observacoes}
              placeholder="Ex.: nunca usar o logo sobre fundo amarelo."
            />
          </div>
          <Enviar>Salvar</Enviar>
        </FormAcao>
      </section>

      {m.pedidos === 0 && !unica && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2>Remover marca</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>
            Só marcas sem pedidos podem ser removidas.
          </p>
          <FormAcao action={removerMarcaAction} confirmar={`Remover a marca ${m.nome}?`}>
            <input type="hidden" name="marca" value={m.id} />
            <Enviar className="btn btn-danger">Remover marca</Enviar>
          </FormAcao>
        </section>
      )}
    </>
  );
}
