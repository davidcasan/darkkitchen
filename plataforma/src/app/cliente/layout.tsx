import { AppShell } from "@/components/app/AppShell";
import { BotaoAtendimento } from "@/components/app/Atendimento";
import type { ItemNav } from "@/components/app/NavArea";
import { adminOriginal, exigirUsuario } from "@/server/auth";
import Link from "next/link";
import { formatarData } from "@/server/datas";
import { assinaturaDo, fimDaCarencia, processarAssinaturas } from "@/server/services/assinaturas";
import { saldo } from "@/server/services/creditos";
import { contarNaoLidas } from "@/server/services/notificacoes";
import { processarAprovacoesAutomaticas } from "@/server/services/pedidos";

const ITENS: ItemNav[] = [
  { href: "/cliente", rotulo: "Início", icone: "inicio", movel: true },
  { href: "/cliente/pedidos/novo", rotulo: "Novo pedido", icone: "novo", movel: true, destaque: true },
  { href: "/cliente/pedidos", rotulo: "Pedidos", icone: "pedidos", movel: true },
  { href: "/cliente/creditos", rotulo: "Créditos", icone: "creditos", movel: true },
  { href: "/cliente/marcas", rotulo: "Marcas", icone: "marca" },
  { href: "/cliente/conta", rotulo: "Conta", icone: "conta", movel: true },
];

export default async function ClienteLayout({ children }: LayoutProps<"/cliente">) {
  const usuario = await exigirUsuario(["cliente"]);
  // As tarefas também rodam a cada hora (instrumentation.ts); aqui é só para o
  // cliente ver tudo em dia ao abrir a área. Uma falha não pode derrubar a página.
  try {
    processarAprovacoesAutomaticas();
    processarAssinaturas(usuario.id);
  } catch (e) {
    console.error("[dark-kitchen] Falha nas tarefas da área do cliente:", e);
  }
  const creditos = saldo(usuario.id);
  const assinatura = assinaturaDo(usuario.id);
  const pendente = assinatura?.status === "ativa" && assinatura.inadimplente_desde ? assinatura : null;
  return (
    <AppShell
      usuario={usuario}
      itens={ITENS}
      raiz="/cliente"
      naoLidas={contarNaoLidas(usuario.id)}
      comoAdmin={(await adminOriginal())?.nome}
      resumo={
        <span>
          Saldo <b className="tnum">{creditos}</b> créditos
        </span>
      }
    >
      {pendente && (
        <p className="alerta alerta-erro" role="alert" style={{ marginBottom: 16 }}>
          Não conseguimos cobrar a renovação do seu plano. Regularize até {formatarData(fimDaCarencia(pendente)!)} para não perder a
          assinatura. <Link href="/cliente/conta">Pagar agora</Link>
        </p>
      )}
      {children}
      <BotaoAtendimento visao="cliente" />
    </AppShell>
  );
}
