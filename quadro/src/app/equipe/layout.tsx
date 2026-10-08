import { AppShell } from "@/components/app/AppShell";
import type { ItemNav } from "@/components/app/NavArea";
import { EQUIPE, PAPEIS } from "@/domain/pedido";
import { adminOriginal, exigirUsuario } from "@/server/auth";
import { contarNaoLidas } from "@/server/services/notificacoes";
import { processarAprovacoesAutomaticas } from "@/server/services/pedidos";

const ITENS: ItemNav[] = [
  { href: "/equipe", rotulo: "Painel", icone: "inicio", movel: true },
  { href: "/equipe/pedidos", rotulo: "Pedidos", icone: "fila", movel: true },
  { href: "/equipe/conta", rotulo: "Conta", icone: "conta", movel: true },
];

const ITEM_CONTAS: ItemNav = { href: "/equipe/contas", rotulo: "Contas", icone: "pessoas", movel: true };

export default async function EquipeLayout({ children }: LayoutProps<"/equipe">) {
  const usuario = await exigirUsuario(EQUIPE);
  processarAprovacoesAutomaticas();
  return (
    <AppShell
      usuario={usuario}
      itens={usuario.papel === "admin" ? [...ITENS.slice(0, 2), ITEM_CONTAS, ITENS[2]] : ITENS}
      raiz="/equipe"
      naoLidas={contarNaoLidas(usuario.id)}
      comoAdmin={(await adminOriginal())?.nome}
      resumo={<span>{PAPEIS[usuario.papel]}</span>}
    >
      {children}
    </AppShell>
  );
}
