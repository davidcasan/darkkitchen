import { comUsuario, falha, ok } from "@/server/api";
import { listarMarcas } from "@/server/services/marcas";

/** Marcas do cliente logado, com seus arquivos (logo e manual). */
export const GET = comUsuario((_req, usuario) =>
  usuario.papel === "cliente" ? ok(listarMarcas(usuario.id)) : falha("Somente clientes têm marcas.", 403),
);
