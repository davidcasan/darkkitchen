// Dark Kitchen Studio - "recomeçar do zero" (out/2026): apaga TODAS as contas de cliente e
// tudo o que pertence a elas, mantendo o resto (admins e equipe, preços, planos, Pix,
// estatística de visitas).
//
// Apaga: clientes; pedidos, versões, comentários e histórico deles; créditos, faturas,
// assinaturas, formas de pagamento; marcas e arquivos (no disco também); conversas do
// atendimento e imagens; notificações e e-mails na fila; sessões e bloqueios de login;
// aceites dos Termos de Uso; mensagens do Telegram ligadas a esses clientes; IA Comp dos pedidos.
// Nunca toca nas mídias do Quem somos (data/arquivos/perfis).
//
// Uso (na pasta plataforma, de preferência com o servidor parado):
//   node scripts/limpar-clientes.mjs              só mostra o que seria apagado
//   node scripts/limpar-clientes.mjs --confirmar  faz backup do banco e apaga
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const raiz = path.resolve(import.meta.dirname, "..");
const envLocal = path.join(raiz, ".env.local");
const env = {
  ...(fs.existsSync(envLocal)
    ? Object.fromEntries(
        fs
          .readFileSync(envLocal, "utf8")
          .split(/\r?\n/)
          .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
          .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
      )
    : {}),
  ...process.env,
};
const dados = env.DK_DADOS ? path.resolve(env.DK_DADOS) : path.join(raiz, "data");
const pastaArquivos = path.join(dados, "arquivos");
const arquivoBanco = path.join(dados, "dark-kitchen.db");
const confirmar = process.argv.includes("--confirmar");

if (!fs.existsSync(arquivoBanco)) {
  console.error(`Banco não encontrado: ${arquivoBanco}`);
  process.exit(1);
}
const d = new DatabaseSync(arquivoBanco);
const lista = (sql, ...p) => d.prepare(sql).all(...p).map((r) => ({ ...r }));
const numero = (sql, ...p) => d.prepare(sql).get(...p).n;

const clientes = lista("SELECT id, email FROM usuarios WHERE papel = 'cliente'");
const C = clientes.map((c) => c.id);
const inC = C.length ? C.join(",") : "NULL";
const P = lista(`SELECT id FROM pedidos WHERE cliente_id IN (${inC})`).map((r) => r.id);
const inP = P.length ? P.join(",") : "NULL";
const M = lista(`SELECT id FROM marcas WHERE usuario_id IN (${inC})`).map((r) => r.id);
const inM = M.length ? M.join(",") : "NULL";
const V = lista(`SELECT id FROM versoes WHERE pedido_id IN (${inP})`).map((r) => r.id);
const inV = V.length ? V.join(",") : "NULL";
const filtroArquivos = `pedido_id IN (${inP}) OR dono_id IN (${inC}) OR marca_id IN (${inM}) OR versao_id IN (${inV})`;
const emails = clientes.map((c) => c.email.toLowerCase());

// Arquivos no disco: os ligados ao que será apagado.
const caminhos = [
  ...lista(`SELECT caminho c FROM arquivos WHERE ${filtroArquivos}`),
  ...lista(`SELECT imagem_caminho c FROM atendimento_mensagens WHERE cliente_id IN (${inC}) AND imagem_caminho IS NOT NULL`),
].map((r) => r.c);

const resumo = {
  "contas de cliente": C.length,
  pedidos: P.length,
  "versões": V.length,
  "comentários": numero(`SELECT COUNT(*) n FROM comentarios WHERE pedido_id IN (${inP})`),
  "histórico dos pedidos": numero(`SELECT COUNT(*) n FROM eventos WHERE pedido_id IN (${inP})`),
  "lançamentos de crédito": numero(`SELECT COUNT(*) n FROM creditos WHERE usuario_id IN (${inC}) OR pedido_id IN (${inP})`),
  faturas: numero(`SELECT COUNT(*) n FROM faturas WHERE usuario_id IN (${inC})`),
  assinaturas: numero(`SELECT COUNT(*) n FROM assinaturas WHERE usuario_id IN (${inC})`),
  marcas: M.length,
  "arquivos (registros)": numero(`SELECT COUNT(*) n FROM arquivos WHERE ${filtroArquivos}`),
  "mensagens do atendimento": numero(`SELECT COUNT(*) n FROM atendimento_mensagens WHERE cliente_id IN (${inC})`),
  "notificações (todas)": numero("SELECT COUNT(*) n FROM notificacoes"),
  "e-mails na fila para clientes": emails.length
    ? numero(`SELECT COUNT(*) n FROM emails_fila WHERE lower(para) IN (${emails.map(() => "?").join(",")})`, ...emails)
    : 0,
  "arquivos no disco": caminhos.length,
};

console.log(confirmar ? "APAGANDO:" : "SIMULAÇÃO (nada foi apagado). Seria apagado:");
for (const [k, v] of Object.entries(resumo)) console.log(`  ${String(v).padStart(5)}  ${k}`);
console.log("Fica:");
console.log(`  ${String(numero("SELECT COUNT(*) n FROM usuarios WHERE papel != 'cliente'")).padStart(5)}  contas da equipe (admins, diretores, designers)`);
console.log(`  ${String(numero("SELECT COUNT(*) n FROM configuracoes")).padStart(5)}  configurações (preços e planos, Pix, chave das estatísticas)`);
console.log(`  ${String(numero("SELECT COUNT(*) n FROM configuracoes_historico")).padStart(5)}  registros do histórico de preços`);
console.log(`  ${String(numero("SELECT COUNT(*) n FROM acessos_visitas")).padStart(5)}  visitas registradas (anônimas)`);
console.log(`  ${String(numero("SELECT COUNT(*) n FROM perfis")).padStart(5)}  perfis do Quem somos (com foto e vídeos)`);
console.log(`  ${String(numero("SELECT COUNT(*) n FROM telegram_destinos")).padStart(5)}  Telegram ligado (admins)`);

if (!confirmar) {
  console.log("\nPara apagar de verdade: node scripts/limpar-clientes.mjs --confirmar");
  process.exit(0);
}

// Backup do banco antes de qualquer alteração.
const pastaBackup = env.BACKUP_DESTINO ? path.join(env.BACKUP_DESTINO, "banco") : dados;
fs.mkdirSync(pastaBackup, { recursive: true });
const copia = path.join(pastaBackup, `antes-da-limpeza_${new Date().toISOString().slice(0, 19).replace("T", "_").replaceAll(":", "")}.db`);
d.exec(`VACUUM INTO '${copia.replace(/'/g, "''")}'`);
console.log(`\nBackup do banco antes da limpeza: ${copia}`);

// Há referências circulares (versão ↔ arquivo): apaga com as chaves desligadas dentro de
// uma transação e confere a integridade antes de gravar.
d.exec("PRAGMA foreign_keys = OFF");
d.exec("BEGIN");
try {
  const apagar = (sql, ...p) => d.prepare(sql).run(...p);
  apagar(`DELETE FROM atendimento_mensagens WHERE cliente_id IN (${inC}) OR pedido_id IN (${inP})`);
  apagar(`DELETE FROM atendimento_leituras WHERE cliente_id IN (${inC}) OR usuario_id IN (${inC})`);
  apagar(`DELETE FROM atendimento_exclusoes WHERE cliente_id IN (${inC})`);
  apagar(`DELETE FROM comentarios WHERE pedido_id IN (${inP}) OR autor_id IN (${inC})`);
  apagar(`DELETE FROM eventos WHERE pedido_id IN (${inP}) OR autor_id IN (${inC})`);
  apagar(`DELETE FROM creditos WHERE usuario_id IN (${inC}) OR pedido_id IN (${inP})`);
  apagar(`DELETE FROM arquivos WHERE ${filtroArquivos}`);
  apagar(`DELETE FROM versoes WHERE pedido_id IN (${inP})`);
  apagar(`DELETE FROM pedidos WHERE id IN (${inP})`);
  apagar(`DELETE FROM faturas WHERE usuario_id IN (${inC})`);
  apagar(`DELETE FROM assinaturas WHERE usuario_id IN (${inC})`);
  apagar(`DELETE FROM metodos_pagamento WHERE usuario_id IN (${inC})`);
  apagar(`DELETE FROM marcas WHERE usuario_id IN (${inC})`);
  apagar(`DELETE FROM senha_tokens WHERE usuario_id IN (${inC})`);
  apagar(`DELETE FROM acessos_logins WHERE usuario_id IN (${inC})`);
  apagar(`DELETE FROM termos_aceites WHERE usuario_id IN (${inC})`);
  apagar(`DELETE FROM telegram_mensagens WHERE cliente_id IN (${inC})`);
  apagar(`DELETE FROM ia_comp_jobs WHERE pedido_id IN (${inP})`); // os arquivos (data/arquivos/ia-comp) saem na varredura abaixo
  apagar(`DELETE FROM sessoes WHERE usuario_id IN (${inC})`);
  // Notificações: as dos clientes e as da equipe, que falam de pedidos e clientes apagados.
  apagar("DELETE FROM notificacoes");
  if (emails.length) apagar(`DELETE FROM emails_fila WHERE lower(para) IN (${emails.map(() => "?").join(",")})`, ...emails);
  apagar("DELETE FROM limites_tentativas");
  apagar(`DELETE FROM usuarios WHERE id IN (${inC})`);
  const problemas = d.prepare("PRAGMA foreign_key_check").all();
  if (problemas.length) throw new Error(`Referências quebradas: ${JSON.stringify(problemas.slice(0, 5))}`);
  d.exec("COMMIT");
} catch (e) {
  d.exec("ROLLBACK");
  d.exec("PRAGMA foreign_keys = ON");
  console.error("Nada foi apagado:", e instanceof Error ? e.message : e);
  process.exit(1);
}
d.exec("PRAGMA foreign_keys = ON");

// Arquivos no disco: os ligados ao que foi apagado e os que não pertencem a mais nada.
let removidos = 0;
for (const c of caminhos) {
  const arq = path.join(pastaArquivos, c);
  if (fs.existsSync(arq)) {
    fs.rmSync(arq);
    removidos++;
  }
}
const emUso = new Set([
  ...lista("SELECT caminho c FROM arquivos").map((r) => path.normalize(r.c)),
  ...lista("SELECT imagem_caminho c FROM atendimento_mensagens WHERE imagem_caminho IS NOT NULL").map((r) => path.normalize(r.c)),
]);
// Mídias do Quem somos (foto e vídeos da equipe) não são de cliente: a pasta fica de fora.
const PASTA_PERFIS = path.join(pastaArquivos, "perfis");
function varrer(pasta) {
  if (!fs.existsSync(pasta) || path.resolve(pasta) === path.resolve(PASTA_PERFIS)) return;
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const arq = path.join(pasta, item.name);
    if (item.isDirectory()) {
      if (path.resolve(arq) === path.resolve(PASTA_PERFIS)) continue;
      varrer(arq);
      if (!fs.readdirSync(arq).length) fs.rmdirSync(arq);
    } else if (!emUso.has(path.relative(pastaArquivos, arq))) {
      fs.rmSync(arq);
      removidos++;
    }
  }
}
varrer(pastaArquivos);
d.exec("VACUUM"); // devolve o espaço do que foi apagado
const integro = d.prepare("PRAGMA integrity_check").get().integrity_check;
d.close();
console.log(`Arquivos removidos do disco: ${removidos}`);
console.log(`Integridade do banco: ${integro}`);
console.log("Pronto. Contas de cliente e tudo ligado a elas foram apagados.");
