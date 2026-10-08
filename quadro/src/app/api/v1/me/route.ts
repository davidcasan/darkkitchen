import { comUsuario, ok } from "@/server/api";
import { saldo } from "@/server/services/creditos";
import { assinaturaDo } from "@/server/services/assinaturas";
import { contarNaoLidas } from "@/server/services/notificacoes";

export const GET = comUsuario((_req, usuario) =>
  ok({
    usuario,
    creditos: usuario.papel === "cliente" ? saldo(usuario.id) : null,
    assinatura: usuario.papel === "cliente" ? (assinaturaDo(usuario.id) ?? null) : null,
    notificacoesNaoLidas: contarNaoLidas(usuario.id),
  }),
);
