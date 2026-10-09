// Roda uma vez quando o servidor sobe: cria os dados de teste se o banco estiver
// vazio e agenda as tarefas periódicas (aprovação automática de versões,
// renovação de assinaturas, cobranças em carência e expiração de créditos).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { popularSeVazio } = await import("./server/seed");
  try {
    await popularSeVazio();
  } catch (e) {
    console.error("[dark-kitchen] Falha ao criar dados de teste:", e);
  }

  const g = globalThis as typeof globalThis & { __dkTarefas?: NodeJS.Timeout };
  if (g.__dkTarefas) return;
  const { processarAprovacoesAutomaticas } = await import("./server/services/pedidos");
  const { processarAssinaturas } = await import("./server/services/assinaturas");
  const rodar = () => {
    try {
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
}
