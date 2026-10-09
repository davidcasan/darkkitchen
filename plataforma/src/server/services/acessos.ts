import "server-only";
import crypto from "node:crypto";
import { executar, um, varios } from "../db";
import type { Papel } from "@/domain/pedido";

// Contador de acessos (out/2026), para o admin.
// - Visitas: cada página vista no site público e na área do cliente. A área da
//   equipe não conta. Robôs (buscadores, prévias de link, navegadores automáticos)
//   ficam de fora.
// - Visitante único: um código anônimo que muda todo dia (resumo de IP + navegador +
//   uma chave secreta do dia). O IP em si nunca é guardado.
// - Logins: cada entrada de usuário (site, cadastro ou app). "Acessar como" do admin não conta.

const ROBOS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|monitor|curl|wget|python|node-fetch/i;

/** Dia no fuso de Brasília (UTC−3, sem horário de verão). */
const diaBrasilia = (d = new Date()) => new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Chave secreta criada uma vez e guardada no banco; com o dia, embaralha o código do visitante. */
function chaveSecreta() {
  const atual = um<{ valor: string }>("SELECT valor FROM configuracoes WHERE chave = 'acessos_chave'");
  if (atual) return atual.valor;
  const nova = crypto.randomBytes(32).toString("hex");
  executar("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('acessos_chave', ?)", nova);
  return um<{ valor: string }>("SELECT valor FROM configuracoes WHERE chave = 'acessos_chave'")!.valor;
}

/** Área da página: site público ou área do cliente. Outras não são contadas. */
function areaDe(caminho: string): "site" | "cliente" | null {
  if (caminho.startsWith("/equipe") || caminho.startsWith("/api") || caminho.startsWith("/_next")) return null;
  return caminho.startsWith("/cliente") ? "cliente" : "site";
}

/** Registra uma página vista. Ignora robôs e recargas da mesma página em menos de 30 segundos. */
export function registrarVisita(dados: { caminho: string; ip: string; navegador: string }) {
  const navegador = dados.navegador.slice(0, 400);
  if (!navegador || ROBOS.test(navegador)) return false;
  const caminho = (dados.caminho.split(/[?#]/)[0] || "/").slice(0, 200);
  if (!caminho.startsWith("/")) return false;
  const area = areaDe(caminho);
  if (!area) return false;
  const dia = diaBrasilia();
  const visitante = crypto
    .createHash("sha256")
    .update(`${chaveSecreta()}|${dia}|${dados.ip}|${navegador}`)
    .digest("hex")
    .slice(0, 24);
  const repetida = um(
    `SELECT 1 FROM acessos_visitas WHERE visitante = ? AND caminho = ? AND criado_em > datetime('now', '-30 seconds')`,
    visitante,
    caminho,
  );
  if (repetida) return false;
  executar(
    "INSERT INTO acessos_visitas (dia, area, caminho, visitante) VALUES (?, ?, ?, ?)",
    dia,
    area,
    caminho,
    visitante,
  );
  return true;
}

export function registrarLogin(usuario: { id: number; papel: Papel }, origem: "site" | "cadastro" | "app") {
  executar(
    "INSERT INTO acessos_logins (usuario_id, papel, origem, dia) VALUES (?, ?, ?, ?)",
    usuario.id,
    usuario.papel,
    origem,
    diaBrasilia(),
  );
}

const ROTULO_PAGINA: Record<string, string> = {
  "/": "Página inicial",
  "/entrar": "Entrar",
  "/cadastro": "Criar conta",
  "/cliente": "Cliente · Início",
  "/cliente/pedidos": "Cliente · Pedidos",
  "/cliente/pedidos/novo": "Cliente · Novo pedido",
  "/cliente/creditos": "Cliente · Créditos",
  "/cliente/marcas": "Cliente · Marcas",
  "/cliente/conta": "Cliente · Conta",
};

/** Agrupa caminhos parecidos (ex.: /cliente/pedidos/12 e /cliente/pedidos/15 viram "Cliente · Um pedido"). */
function rotuloDe(caminho: string) {
  if (ROTULO_PAGINA[caminho]) return ROTULO_PAGINA[caminho];
  if (/^\/cliente\/pedidos\/\d+/.test(caminho)) return "Cliente · Um pedido";
  if (/^\/cliente\/marcas\/\d+/.test(caminho)) return "Cliente · Uma marca";
  return caminho;
}

export function resumoAcessos() {
  const hoje = diaBrasilia();
  const diasAtras = (n: number) => diaBrasilia(new Date(Date.now() - n * 86400000));
  const desde7 = diasAtras(6);
  const desde30 = diasAtras(29);

  const visitas = (desde: string, area?: string) =>
    um<{ unicos: number; paginas: number }>(
      `SELECT COUNT(DISTINCT visitante || dia) unicos, COUNT(*) paginas FROM acessos_visitas
       WHERE dia >= ? ${area ? "AND area = ?" : ""}`,
      ...(area ? [desde, area] : [desde]),
    )!;
  const logins = (desde: string) =>
    um<{ n: number; pessoas: number }>(
      "SELECT COUNT(*) n, COUNT(DISTINCT usuario_id) pessoas FROM acessos_logins WHERE dia >= ?",
      desde,
    )!;

  // Visitantes únicos por dia, últimos 30 dias (dias sem visita entram com zero).
  const porDia = new Map(
    varios<{ dia: string; unicos: number; paginas: number }>(
      "SELECT dia, COUNT(DISTINCT visitante) unicos, COUNT(*) paginas FROM acessos_visitas WHERE dia >= ? GROUP BY dia",
      desde30,
    ).map((r) => [r.dia, r]),
  );
  const serie = Array.from({ length: 30 }, (_, i) => {
    const dia = diasAtras(29 - i);
    return { dia, unicos: porDia.get(dia)?.unicos ?? 0, paginas: porDia.get(dia)?.paginas ?? 0 };
  });

  const paginasBrutas = varios<{ caminho: string; n: number; unicos: number }>(
    `SELECT caminho, COUNT(*) n, COUNT(DISTINCT visitante || dia) unicos FROM acessos_visitas
     WHERE dia >= ? GROUP BY caminho`,
    desde30,
  );
  const agrupadas = new Map<string, { rotulo: string; n: number; unicos: number }>();
  for (const p of paginasBrutas) {
    const rotulo = rotuloDe(p.caminho);
    const atual = agrupadas.get(rotulo) ?? { rotulo, n: 0, unicos: 0 };
    atual.n += p.n;
    atual.unicos += p.unicos;
    agrupadas.set(rotulo, atual);
  }
  const paginas = [...agrupadas.values()].sort((a, b) => b.n - a.n).slice(0, 10);

  const loginsPorPapel = varios<{ papel: Papel; n: number; pessoas: number }>(
    "SELECT papel, COUNT(*) n, COUNT(DISTINCT usuario_id) pessoas FROM acessos_logins WHERE dia >= ? GROUP BY papel ORDER BY n DESC",
    desde30,
  );
  const ultimosLogins = varios<{ nome: string; email: string; papel: Papel; origem: string; criado_em: string }>(
    `SELECT u.nome, u.email, l.papel, l.origem, l.criado_em FROM acessos_logins l
     JOIN usuarios u ON u.id = l.usuario_id ORDER BY l.id DESC LIMIT 15`,
  );

  return {
    hoje: visitas(hoje),
    semana: visitas(desde7),
    mes: visitas(desde30),
    mesSite: visitas(desde30, "site"),
    mesCliente: visitas(desde30, "cliente"),
    loginsHoje: logins(hoje),
    loginsMes: logins(desde30),
    total: um<{ n: number; desde: string | null }>("SELECT COUNT(*) n, MIN(dia) desde FROM acessos_visitas")!,
    serie,
    paginas,
    loginsPorPapel,
    ultimosLogins,
  };
}
