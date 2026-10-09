// Roda uma vez quando o servidor sobe: cria os dados de teste se o banco estiver
// vazio e agenda as tarefas periódicas (aprovação automática de versões).
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
  const rodar = () => {
    try {
      const n = processarAprovacoesAutomaticas();
      if (n) console.log(`[dark-kitchen] ${n} pedido(s) aprovado(s) automaticamente.`);
    } catch (e) {
      console.error("[dark-kitchen] Falha na aprovação automática:", e);
    }
  };
  rodar();
  g.__dkTarefas = setInterval(rodar, 60 * 60 * 1000); // a cada hora
}
