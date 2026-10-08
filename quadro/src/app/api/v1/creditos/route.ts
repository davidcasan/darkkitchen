import { comUsuario, ok } from "@/server/api";
import { extrato, saldo } from "@/server/services/creditos";

export const GET = comUsuario((_req, usuario) => ok({ saldo: saldo(usuario.id), extrato: extrato(usuario.id) }));
