import { AppShell } from "@/components/app/AppShell";
import type { ItemNav } from "@/components/app/NavArea";
import { PAPEIS } from "@/domain/pedido";
import { exigirUsuario } from "@/server/auth";
import { contarNaoLidas } from "@/server/services/notificacoes";

const ITENS: ItemNav[] = [
  { href: "/equipe", rotulo: "Painel", icone: "inicio", movel: true },
  { href: "/equipe/pedidos", rotulo: "Pedidos", icone: "fila", movel: true },
  { href: "/equipe/conta", rotulo: "Conta", icone: "conta", movel: true },
];

export default async function EquipeLayout({ children }: LayoutProps<"/equipe">) {
  const usuario = await exigirUsuario(["designer", "gerente", "diretor", "admin"]);
  return (
    <AppShell
      usuario={usuario}
      itens={ITENS}
      raiz="/equipe"
      naoLidas={contarNaoLidas(usuario.id)}
      resumo={<span>{PAPEIS[usuario.papel]}</span>}
    >
      {children}
    </AppShell>
  );
}
