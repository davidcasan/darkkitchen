import type { Metadata } from "next";
import { Wizard, type ArquivoMarca } from "@/components/briefing/Wizard";
import { exigirUsuario } from "@/server/auth";
import { um } from "@/server/db";
import { arquivosDaMarca } from "@/server/services/arquivos";
import { saldo } from "@/server/services/creditos";

export const metadata: Metadata = { title: "Novo pedido" };

export default async function NovoPedido() {
  const u = await exigirUsuario(["cliente"]);
  const arquivos: ArquivoMarca[] = arquivosDaMarca(u.id).map((a) => ({
    id: a.id,
    nome: a.nome,
    categoria: a.categoria as "logo" | "manual",
  }));
  const marca = um<{ cores: string }>("SELECT cores FROM marcas WHERE usuario_id = ?", u.id);
  const cores = marca ? (JSON.parse(marca.cores) as string[]) : [];

  return <Wizard saldo={saldo(u.id)} arquivosMarca={arquivos} coresMarca={cores} aprovador={u.nome} email={u.email} />;
}
