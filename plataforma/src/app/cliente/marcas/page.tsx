import type { Metadata } from "next";
import Link from "next/link";
import { novaMarcaAction } from "@/app/actions/cliente";
import { Confirmacao } from "@/components/app/Confirmacao";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { urlArquivo } from "@/components/app/upload";
import { exigirUsuario } from "@/server/auth";
import { listarMarcas } from "@/server/services/marcas";
import styles from "./marcas.module.css";

export const metadata: Metadata = { title: "Marcas" };

export default async function MarcasPage({ searchParams }: PageProps<"/cliente/marcas">) {
  const u = await exigirUsuario(["cliente"]);
  const { ok } = await searchParams;
  const marcas = listarMarcas(u.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Marcas</h1>
          <p>Cada marca guarda seu logo, manual, cores e observações. No pedido, você escolhe a marca e tudo já vem pronto.</p>
        </div>
      </div>

      <Confirmacao texto={ok === "removida" ? "Marca removida." : null} />

      <div className={styles.grade}>
        {marcas.map((m) => {
          const logo = m.arquivos.find((a) => a.categoria === "logo");
          return (
            <Link key={m.id} href={`/cliente/marcas/${m.id}`} className={styles.cartao}>
              <span className={styles.logo}>
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urlArquivo(logo.id)} alt="" />
                ) : (
                  <span className="muted small">Sem logo</span>
                )}
              </span>
              <b>{m.nome}</b>
              <span className="row small">
                {m.cores.map((c) => (
                  <span key={c} className="swatch" style={{ background: c, width: 16, height: 16 }} />
                ))}
              </span>
              <span className="muted small">
                {m.arquivos.length} {m.arquivos.length === 1 ? "arquivo" : "arquivos"} · {m.pedidos}{" "}
                {m.pedidos === 1 ? "pedido" : "pedidos"}
              </span>
            </Link>
          );
        })}

        <section className={`${styles.cartao} ${styles.nova}`}>
          <b>Nova marca</b>
          <FormAcao action={novaMarcaAction}>
            <label className="sr-only" htmlFor="nova-marca">
              Nome da nova marca
            </label>
            <input id="nova-marca" name="nome" className="txt" required minLength={2} placeholder="Ex.: Verão Kids" />
            <div style={{ marginTop: 10 }}>
              <Enviar className="btn btn-sm">Criar marca</Enviar>
            </div>
          </FormAcao>
        </section>
      </div>
    </>
  );
}
