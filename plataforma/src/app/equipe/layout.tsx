import { AppShell } from "@/components/app/AppShell";
import { BotaoAtendimento } from "@/components/app/Atendimento";
import type { GrupoNav, ItemNav } from "@/components/app/NavArea";
import { EQUIPE, PAPEIS } from "@/domain/pedido";
import { adminOriginal, exigirUsuario } from "@/server/auth";
import { naoLidasAtendimento } from "@/server/services/atendimento";
import { contarPixPendentes } from "@/server/services/assinaturas";
import { contarNaoLidas } from "@/server/services/notificacoes";
import { processarAprovacoesAutomaticas } from "@/server/services/pedidos";

const ITENS: ItemNav[] = [
  { href: "/equipe", rotulo: "Painel", icone: "inicio", movel: true },
  { href: "/equipe/pedidos", rotulo: "Pedidos", icone: "fila", movel: true },
  { href: "/equipe/ganhos", rotulo: "Meus ganhos", icone: "creditos", movel: true },
  { href: "/equipe/conta", rotulo: "Conta", icone: "conta", movel: true },
];

// Menu do admin em submenus (out/2026). A barra do celular continua com os itens "movel".
const GRUPOS_ADMIN: GrupoNav[] = [
  { id: "atendimento", rotulo: "Atendimento", icone: "chat" },
  { id: "financeiro", rotulo: "Financeiro", icone: "creditos" },
  { id: "gerenciamento", rotulo: "Gerenciamento", icone: "engrenagem" },
  { id: "analise", rotulo: "Análise", icone: "grafico" },
  { id: "automacao", rotulo: "Automação", icone: "raio" },
  { id: "conta", rotulo: "Minha conta", icone: "conta" },
];

const ITENS_ADMIN: ItemNav[] = [
  { href: "/equipe", rotulo: "Painel", icone: "inicio", movel: true },
  { href: "/equipe/pedidos", rotulo: "Pedidos", icone: "fila", movel: true, grupo: "atendimento" },
  { href: "/equipe/contas", rotulo: "Contas", icone: "pessoas", movel: true, grupo: "atendimento" },
  { href: "/equipe/atendimento", rotulo: "Chats", icone: "chat", movel: true, grupo: "atendimento" },
  { href: "/equipe/pagamentos", rotulo: "Pagamentos", icone: "creditos", grupo: "financeiro" },
  { href: "/equipe/colaboradores", rotulo: "Colaboradores", icone: "pessoas", grupo: "financeiro" },
  { href: "/equipe/precos", rotulo: "Preços", icone: "creditos", grupo: "gerenciamento" },
  { href: "/equipe/quem-somos", rotulo: "Quem somos", icone: "pessoas", grupo: "gerenciamento" },
  { href: "/equipe/termos", rotulo: "Termos de uso", icone: "pedidos", grupo: "gerenciamento" },
  { href: "/equipe/relatorios", rotulo: "Relatórios", icone: "grafico", grupo: "analise" },
  { href: "/equipe/acessos", rotulo: "Acessos", icone: "olho", grupo: "analise" },
  { href: "/equipe/clientes", rotulo: "Usuários", icone: "grafico", grupo: "analise" },
  { href: "/equipe/ia-comp", rotulo: "IA Comp", icone: "raio", grupo: "automacao" },
  { href: "/equipe/conta", rotulo: "Conta", icone: "conta", movel: true, grupo: "conta" },
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
      itens={admin ? itensAdmin : ITENS}
      grupos={admin ? GRUPOS_ADMIN : undefined}
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
