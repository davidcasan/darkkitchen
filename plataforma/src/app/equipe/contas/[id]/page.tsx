import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  acessarComoAction,
  ajustarCreditosAction,
  atualizarContaAction,
  reativarContaAction,
  redefinirSenhaAction,
  removerContaAction,
} from "@/app/actions/admin";
import { Confirmacao } from "@/components/app/Confirmacao";
import { Enviar, FormAcao } from "@/components/app/FormAcao";
import { type Papel, PAPEIS } from "@/domain/pedido";
import { exigirUsuario } from "@/server/auth";
import { formatarData } from "@/server/datas";
import { ErroNegocio } from "@/server/db";
import { type Conta, contaPorId } from "@/server/services/contas";
import { CamposConta } from "../CamposConta";

export const metadata: Metadata = { title: "Conta" };

const EQUIPE_PAPEIS: Papel[] = ["designer", "diretor", "admin"];

const CONFIRMACOES: Record<string, string> = {
  desativada:
    "A conta tinha histórico, então foi desativada: a pessoa não consegue mais entrar, mas pedidos e extrato foram preservados.",
  reativada: "Conta reativada. A pessoa já pode entrar de novo.",
};

export default async function ContaDetalhe({ params, searchParams }: PageProps<"/equipe/contas/[id]">) {
  const admin = await exigirUsuario(["admin"]);
  const { id } = await params;
  const { ok } = await searchParams;
  const confirmacao = typeof ok === "string" ? (CONFIRMACOES[ok] ?? null) : null;
  let c: Conta;
  try {
    c = contaPorId(admin, Number(id));
  } catch (e) {
    if (e instanceof ErroNegocio) notFound();
    throw e;
  }
  const cliente = c.papel === "cliente";
  const voce = c.id === admin.id;
  // Conta com pedidos não troca entre cliente e colaborador.
  const papeis: Papel[] = c.pedidos > 0 ? (cliente ? ["cliente"] : EQUIPE_PAPEIS) : [...EQUIPE_PAPEIS, "cliente"];

  return (
    <>
      <Link href={`/equipe/contas?tipo=${cliente ? "clientes" : "equipe"}`} className="link small">
        ← Contas
      </Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <h1>{c.nome}</h1>
          <p className="row">
            <span className="badge">
              {PAPEIS[c.papel]}
              {c.senior ? " sênior" : ""}
            </span>
            {!c.ativo && <span className="tag">Desativada</span>}
            <span className="muted small">Desde {formatarData(c.criado_em)}</span>
          </p>
        </div>
        <div className="row">
          {cliente && (
            <Link href={`/equipe/atendimento?cliente=${c.id}`} className="btn">
              Atendimento
            </Link>
          )}
          {!voce && c.ativo === 1 && (
            <FormAcao action={acessarComoAction}>
              <input type="hidden" name="id" value={c.id} />
              <Enviar className="btn btn-primary">Acessar como {c.nome.split(" ")[0]}</Enviar>
            </FormAcao>
          )}
        </div>
      </div>

      <Confirmacao texto={confirmacao} />

      <div className="grid-kpi" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <span>Pedidos</span>
          <b>{c.pedidos}</b>
        </div>
        <div className="kpi">
          <span>Em andamento</span>
          <b>{c.ativos}</b>
        </div>
        {cliente && (
          <div className="kpi">
            <span>Saldo</span>
            <b>{c.saldo}</b>
            <small>créditos</small>
          </div>
        )}
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Dados da conta</h2>
          <FormAcao action={atualizarContaAction}>
            <input type="hidden" name="id" value={c.id} />
            <CamposConta inicial={c} papeisPermitidos={voce ? ["admin"] : papeis} />
            <Enviar>Salvar</Enviar>
          </FormAcao>
        </section>

        <div>
          <section className="card">
            <h2>Senha</h2>
            <p className="muted small" style={{ marginBottom: 12 }}>
              Gera uma senha temporária, mostrada só agora, e encerra as sessões abertas desta conta. Envie a senha à pessoa e
              peça que ela troque em Conta.
            </p>
            <FormAcao action={redefinirSenhaAction} confirmar={`Gerar uma nova senha para ${c.nome}?`}>
              <input type="hidden" name="id" value={c.id} />
              <Enviar className="btn">Redefinir senha</Enviar>
            </FormAcao>
          </section>

          {cliente && (
            <section className="card">
              <h2>Ajustar créditos</h2>
              <FormAcao action={ajustarCreditosAction}>
                <input type="hidden" name="id" value={c.id} />
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div className="field" style={{ flex: "0 1 130px" }}>
                    <label className="label" htmlFor="aj-qtd">
                      Quantidade
                    </label>
                    <input id="aj-qtd" name="quantidade" type="number" className="txt" required placeholder="10 ou -5" />
                  </div>
                  <div className="field" style={{ flex: "1 1 200px" }}>
                    <label className="label" htmlFor="aj-motivo">
                      Motivo
                    </label>
                    <input id="aj-motivo" name="motivo" className="txt" required placeholder="Cortesia, correção de cobrança..." />
                  </div>
                </div>
                <Enviar className="btn">Lançar no extrato</Enviar>
              </FormAcao>
            </section>
          )}

          {!voce && (
            <section className="card">
              <h2>{c.ativo ? "Remover conta" : "Conta desativada"}</h2>
              {c.ativo ? (
                <>
                  <p className="muted small" style={{ marginBottom: 12 }}>
                    Contas sem histórico são apagadas. Contas com pedidos, arquivos ou créditos são desativadas: a pessoa não
                    consegue mais entrar, mas o histórico fica preservado.
                    {c.ativos > 0 && ` Antes, resolva os ${c.ativos} pedido(s) em andamento.`}
                  </p>
                  <FormAcao action={removerContaAction} confirmar={`Remover a conta de ${c.nome}?`}>
                    <input type="hidden" name="id" value={c.id} />
                    <Enviar className="btn btn-danger">Remover conta</Enviar>
                  </FormAcao>
                </>
              ) : (
                <FormAcao action={reativarContaAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <p className="muted small" style={{ marginBottom: 12 }}>
                    Esta pessoa não consegue entrar. Reative para devolver o acesso.
                  </p>
                  <Enviar className="btn">Reativar conta</Enviar>
                </FormAcao>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
