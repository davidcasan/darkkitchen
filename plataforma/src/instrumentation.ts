// Roda uma vez quando o servidor sobe. Desenvolvimento: cria os dados de teste se o
// banco estiver vazio. Produção: cria só o admin real e desativa contas de teste
// (server/producao.ts). Nos dois casos, agenda as tarefas periódicas (aprovação automática de versões,
// renovação de assinaturas, cobranças em carência e expiração de créditos).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    if (process.env.NODE_ENV === "production") {
      const { prepararProducao } = await import("./server/producao");
      prepararProducao();
    } else {
      const { popularSeVazio } = await import("./server/seed");
      await popularSeVazio();
    }
  } catch (e) {
    console.error("[dark-kitchen] Falha ao preparar o banco:", e);
  }

  const g = globalThis as typeof globalThis & { __dkTarefas?: NodeJS.Timeout };
  if (g.__dkTarefas) return;
  const { processarAprovacoesAutomaticas } = await import("./server/services/pedidos");
  const { processarAssinaturas } = await import("./server/services/assinaturas");
  const { limparTentativasAntigas } = await import("./server/services/limites");
  const rodar = () => {
    try {
      limparTentativasAntigas();
      const n = processarAprovacoesAutomaticas();
      if (n) console.log(`[dark-kitchen] ${n} pedido(s) aprovado(s) automaticamente.`);
    } catch (e) {
      console.error("[dark-kitchen] Falha na aprovação automática:", e);
    }
    try {
      const n = processarAssinaturas();
      if (n) console.log(`[dark-kitchen] ${n} assinatura(s) processada(s).`);
    } catch (e) {
      console.error("[dark-kitchen] Falha ao processar assinaturas:", e);
    }
  };
  rodar();
  g.__dkTarefas = setInterval(rodar, 60 * 60 * 1000); // a cada hora

  // Fila de e-mails: a cada 30 segundos (e logo depois de cada aviso).
  const { processarFilaEmails } = await import("./server/services/email");
  const enviarEmails = () => processarFilaEmails().catch((e) => console.error("[dark-kitchen] Falha na fila de e-mails:", e));
  enviarEmails();
  setInterval(enviarEmails, 30 * 1000);

  // IA Comp: sugestões da IA + kit do After para pedidos novos (só quando o admin liga).
  const { processarFilaIaComp } = await import("./server/services/iaComp");
  const iaComp = () => processarFilaIaComp().catch((e) => console.error("[dark-kitchen] Falha na IA Comp:", e));
  setInterval(iaComp, 30 * 1000);

  // Atendimento pelo Telegram (só se TELEGRAM_BOT_TOKEN estiver no .env.local).
  const { iniciarTelegram } = await import("./server/services/telegram");
  iniciarTelegram();
}
