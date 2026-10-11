import type { Metadata } from "next";
import { Wizard, type MarcaWizard } from "@/components/briefing/Wizard";
import { adminOriginal, exigirUsuario } from "@/server/auth";
import { toursVistos } from "@/server/services/tours";
import { saldo } from "@/server/services/creditos";
import { listarMarcas } from "@/server/services/marcas";
import { precos } from "@/server/services/precos";

export const metadata: Metadata = { title: "Novo pedido" };

export default async function NovoPedido() {
  const u = await exigirUsuario(["cliente"]);
  const marcas: MarcaWizard[] = listarMarcas(u.id).map((m) => ({
    id: m.id,
    nome: m.nome,
    cores: m.cores,
    arquivos: m.arquivos.map((a) => ({ id: a.id, nome: a.nome, categoria: a.categoria as "logo" | "manual" })),
  }));

  return (
    <Wizard
      saldo={saldo(u.id)}
      precos={precos()}
      marcas={marcas}
      aprovador={u.nome}
      email={u.email}
      toursVistos={toursVistos(u.id)}
      toursAutomaticos={!(await adminOriginal())}
    />
  );
}
