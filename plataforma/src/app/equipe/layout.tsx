import { AppShell } from "@/components/app/AppShell";
import { BotaoAtendimento } from "@/components/app/Atendimento";
import type { ItemNav } from "@/components/app/NavArea";
import { EQUIPE, PAPEIS } from "@/domain/pedido";
import { adminOriginal, exigirUsuario } from "@/server/auth";
import { naoLidasAtendimento } from "@/server/services/atendimento";
import { contarPixPendentes } from "@/server/services/assinaturas";
import { contarNaoLidas } from "@/server/services/notificacoes";
import { processarAprovacoesAutomaticas } from "@/server/services/pedidos";

const ITENS: ItemNav[] = [
  { href: "/equipe", rotulo: "Painel", icone: "inicio", movel: true },
  { href: "/equipe/pedidos", rotulo: "Pedidos", icone: "fila", movel: true },
  { href: "/equipe/conta", rotulo: "Conta", icone: "conta", movel: true },
];

const ITENS_ADMIN: ItemNav[] = [
  { href: "/equipe/atendimento", rotulo: "Atendimento", icone: "chat", movel: true },
  { href: "/equipe/pagamentos", rotulo: "Pagamentos", icone: "creditos" },
  { href: "/equipe/contas", rotulo: "Contas", icone: "pessoas", movel: true },
  { href: "/equipe/relatorios", rotulo: "Relatórios", icone: "grafico" },
  { href: "/equipe/acessos", rotulo: "Acessos", icone: "olho" },
  { href: "/equipe/precos", rotulo: "Preços", icone: "creditos" },
];

export default async function EquipeLayout({ children }: LayoutProps<"/equipe">) {
  const usuario = await exigirUsuario(EQUIPE);
  processarAprovacoesAutomaticas();
  const admin = usuario.papel === "admin";
  const itensAdmin = admin
    ? ITENS_ADMIN.map((i) =>
        i.href === "/equipe/atendimento"
          ? { ...i, selo: naoLidasAtendimento(usuario) }
          : i.href === "/equipe/pagamentos"
            ? { ...i, selo: contarPixPendentes() }
            : i,
      )
    : [];
  return (
    <AppShell
      usuario={usuario}
      itens={admin ? [...ITENS.slice(0, 2), ...itensAdmin, ITENS[2]] : ITENS}
      raiz="/equipe"
      naoLidas={contarNaoLidas(usuario.id)}
      comoAdmin={(await adminOriginal())?.nome}
      resumo={<span>{PAPEIS[usuario.papel]}</span>}
    >
      {children}
      {admin && <BotaoAtendimento visao="admin" />}
    </AppShell>
  );
}
