import { encerrarSessao } from "@/server/auth";
import { ok } from "@/server/api";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) encerrarSessao(auth.slice(7).trim());
  return ok({ saiu: true });
}
