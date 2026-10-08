// Roda uma vez quando o servidor sobe: cria os dados de teste se o banco estiver
// vazio e agenda as tarefas periódicas (aprovação automática de versões).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { popularSeVazio } = await import("./server/seed");
  try {
    await popularSeVazio();
  } catch (e) {
    console.error("[quadro] Falha ao criar dados de teste:", e);
  }

  const g = globalThis as typeof globalThis & { __quadroTarefas?: NodeJS.Timeout };
  if (g.__quadroTarefas) return;
  const { processarAprovacoesAutomaticas } = await import("./server/services/pedidos");
  const rodar = () => {
    try {
      const n = processarAprovacoesAutomaticas();
      if (n) console.log(`[quadro] ${n} pedido(s) aprovado(s) automaticamente.`);
    } catch (e) {
      console.error("[quadro] Falha na aprovação automática:", e);
    }
  };
  rodar();
  g.__quadroTarefas = setInterval(rodar, 60 * 60 * 1000); // a cada hora
}
