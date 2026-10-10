import { criarSessao } from "@/server/auth";
import { falha, ok, tratarErro } from "@/server/api";
import { registrarLogin } from "@/server/services/acessos";
import { autenticar } from "@/server/services/usuarios";
import { ipDe } from "@/server/ip";

// Login para clientes da API (ex.: app mobile). Devolve um token Bearer.
export async function POST(req: Request) {
  try {
    const corpo = (await req.json().catch(() => null)) as { email?: string; senha?: string } | null;
    if (!corpo?.email || !corpo?.senha) return falha("Informe e-mail e senha.");
    const usuario = autenticar(corpo.email, corpo.senha, ipDe(req.headers));
    const { token, expira } = criarSessao(usuario.id);
    registrarLogin(usuario, "app", ipDe(req.headers));
    return ok({ token, expiraEm: expira.toISOString(), usuario });
  } catch (e) {
    return tratarErro(e);
  }
}
