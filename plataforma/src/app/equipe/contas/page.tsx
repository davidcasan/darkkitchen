import type { Metadata } from "next";
import Link from "next/link";
import { criarContaAction } from "@/app/actions/admin";
import { Confirmacao } from "@/components/app/Confirmacao";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { PAPEIS } from "@/domain/pedido";
import { exigirUsuario } from "@/server/auth";
import { formatarData } from "@/server/datas";
import { listarContas } from "@/server/services/contas";
import { CamposConta } from "./CamposConta";

export const metadata: Metadata = { title: "Contas" };

export default async function ContasPage({ searchParams }: PageProps<"/equipe/contas">) {
  const admin = await exigirUsuario(["admin"]);
  const sp = await searchParams;
  const tipo = sp.tipo === "equipe" ? "equipe" : "clientes";
  const busca = typeof sp.q === "string" ? sp.q : "";
  const inativos = sp.inativos === "1";
  const contas = listarContas(admin, { tipo, busca, inativos });

  const link = (t: string, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ tipo: t, ...(busca ? { q: busca } : {}), ...(inativos ? { inativos: "1" } : {}), ...extra });
    return `/equipe/contas?${q}`;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Contas</h1>
          <p>Clientes e colaboradores da plataforma.</p>
        </div>
      </div>

      <Confirmacao texto={sp.ok === "removida" ? "Conta removida." : null} />

      <details className="card" style={{ marginBottom: 16 }} open={sp.nova === "1"}>
        <summary className="btn btn-primary">+ Nova conta</summary>
        <div style={{ marginTop: 16 }}>
          <FormAcao action={criarContaAction}>
            <CamposConta />
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label className="label" htmlFor="c-senha">
                  Senha <span className="opt">(opcional)</span>
                </label>
                <input id="c-senha" name="senha" className="txt" minLength={8} autoComplete="new-password" />
                <span className="hint">Em branco, o sistema gera uma senha temporária e mostra aqui.</span>
              </div>
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label className="label" htmlFor="c-creditos">
                  Créditos iniciais <span className="opt">(só cliente)</span>
                </label>
                <input id="c-creditos" name="creditos" type="number" min={0} className="txt" defaultValue={0} />
                <span className="hint">Conta criada aqui não tem assinatura; o cliente assina depois em Conta.</span>
              </div>
            </div>
            <Enviar>Criar conta</Enviar>
          </FormAcao>
        </div>
      </details>

      <div className="row-between" style={{ marginBottom: 12 }}>
        <nav className="chips" aria-label="Tipo de conta">
          <Link href={link("clientes")} className="chip" aria-current={tipo === "clientes" ? "page" : undefined}>
            Clientes
          </Link>
          <Link href={link("equipe")} className="chip" aria-current={tipo === "equipe" ? "page" : undefined}>
            Colaboradores
          </Link>
        </nav>
        <form className="row" action="/equipe/contas">
          <input type="hidden" name="tipo" value={tipo} />
          {inativos && <input type="hidden" name="inativos" value="1" />}
          <label className="sr-only" htmlFor="busca">
            Buscar
          </label>
          <input id="busca" name="q" className="txt" defaultValue={busca} placeholder="Nome, e-mail ou empresa" style={{ width: 240 }} />
          <button type="submit" className="btn">
            Buscar
          </button>
        </form>
      </div>
      <p className="small" style={{ marginBottom: 12 }}>
        <Link href={inativos ? link(tipo).replace("&inativos=1", "") : link(tipo, { inativos: "1" })} className="link">
          {inativos ? "Ocultar contas desativadas" : "Mostrar contas desativadas"}
        </Link>
      </p>

      <section className="card">
        {contas.length === 0 ? (
          <p className="vazio">Nenhuma conta encontrada.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="extrato">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>{tipo === "clientes" ? "Empresa" : "Papel"}</th>
                  <th className="num">{tipo === "clientes" ? "Saldo" : "Em andamento"}</th>
                  <th className="num">Pedidos</th>
                  <th>Desde</th>
                </tr>
              </thead>
              <tbody>
                {contas.map((c) => (
                  <tr key={c.id} style={c.ativo ? undefined : { opacity: 0.55 }}>
                    <td>
                      <Link href={`/equipe/contas/${c.id}`} className="link">
                        {c.nome}
                      </Link>
                      {!c.ativo && <span className="tag" style={{ marginLeft: 6 }}>Desativada</span>}
                      {c.id === admin.id && <span className="badge" style={{ marginLeft: 6 }}>Você</span>}
                      <br />
                      <small className="muted">{c.email}</small>
                    </td>
                    <td>{tipo === "clientes" ? (c.empresa ?? "—") : `${PAPEIS[c.papel]}${c.senior ? " sênior" : ""}`}</td>
                    <td className="num">{tipo === "clientes" ? c.saldo : c.ativos}</td>
                    <td className="num">{c.pedidos}</td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>
                      {formatarData(c.criado_em)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
