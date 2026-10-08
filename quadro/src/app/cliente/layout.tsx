import { AppShell } from "@/components/app/AppShell";
import type { ItemNav } from "@/components/app/NavArea";
import { exigirUsuario } from "@/server/auth";
import { renovarSeVencida } from "@/server/services/assinaturas";
import { saldo } from "@/server/services/creditos";
import { contarNaoLidas } from "@/server/services/notificacoes";

const ITENS: ItemNav[] = [
  { href: "/cliente", rotulo: "Início", icone: "inicio", movel: true },
  { href: "/cliente/pedidos/novo", rotulo: "Novo pedido", icone: "novo", movel: true, destaque: true },
  { href: "/cliente/pedidos", rotulo: "Pedidos", icone: "pedidos", movel: true },
  { href: "/cliente/creditos", rotulo: "Créditos", icone: "creditos", movel: true },
  { href: "/cliente/marca", rotulo: "Marca", icone: "marca" },
  { href: "/cliente/conta", rotulo: "Conta", icone: "conta", movel: true },
];

export default async function ClienteLayout({ children }: LayoutProps<"/cliente">) {
  const usuario = await exigirUsuario(["cliente"]);
  renovarSeVencida(usuario.id);
  const creditos = saldo(usuario.id);
  return (
    <AppShell
      usuario={usuario}
      itens={ITENS}
      raiz="/cliente"
      naoLidas={contarNaoLidas(usuario.id)}
      resumo={
        <span>
          Saldo <b className="tnum">{creditos}</b> créditos
        </span>
      }
    >
      {children}
    </AppShell>
  );
}
