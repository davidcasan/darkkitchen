import { ok } from "@/server/api";
import { perfisVisiveis, urlMidia } from "@/server/services/perfis";

// Quem somos: perfis visíveis no site (pública; usada também pelo futuro app).
export function GET() {
  return ok(
    perfisVisiveis().map((p) => ({
      id: p.id,
      nome: p.nome,
      funcao: p.funcao,
      bio: p.bio,
      foto: p.foto && urlMidia(p.foto),
      video16x9: p.video_16x9 && urlMidia(p.video_16x9),
      video9x16: p.video_9x16 && urlMidia(p.video_9x16),
      titulo16x9: p.titulo_16x9,
      titulo9x16: p.titulo_9x16,
    })),
  );
}
