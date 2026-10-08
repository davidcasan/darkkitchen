"use server";

import { type Estado, campo, campoNumero, rodar } from "@/server/acao";
import { exigirUsuario } from "@/server/auth";
import { comentar } from "@/server/services/pedidos";

/** Comentário no pedido; com "tempo", fica marcado no segundo exato do vídeo. */
export async function comentarAction(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  const tempo = campo(fd, "tempo");
  return rodar(() =>
    comentar(u, campoNumero(fd, "pedido"), {
      texto: campo(fd, "texto"),
      tempo: tempo === "" ? null : Number(tempo),
      versaoId: campoNumero(fd, "versao") || null,
      interno: campo(fd, "interno") === "1",
    }),
  );
}
