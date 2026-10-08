// Roda uma vez quando o servidor sobe: cria os dados de teste se o banco estiver vazio.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { popularSeVazio } = await import("./server/seed");
  try {
    await popularSeVazio();
  } catch (e) {
    console.error("[quadro] Falha ao criar dados de teste:", e);
  }
}
