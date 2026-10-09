import { registrarVisita } from "@/server/services/acessos";

// Recebe as páginas vistas (enviadas pelo navegador ao abrir cada página).
// Não exige login. Responde sempre 204, sem dados: não há nada para ler aqui.
export async function POST(req: Request) {
  try {
    const corpo = (await req.json().catch(() => null)) as { caminho?: unknown } | null;
    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "local";
    if (typeof corpo?.caminho === "string")
      registrarVisita({ caminho: corpo.caminho, ip, navegador: req.headers.get("user-agent") ?? "" });
  } catch (e) {
    console.error("[dark-kitchen] Falha ao registrar acesso:", e);
  }
  return new Response(null, { status: 204 });
}
