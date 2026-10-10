// Dark Kitchen Studio · Máquina operária da IA Comp (out/2026).
// Roda num computador com After Effects instalado. A cada 20 s pergunta ao site se há
// pedido esperando; se houver, baixa o kit, abre o After (a janela aparece por alguns
// segundos: o modo sem interface "-noui" não roda scripts no After 2026), monta a composição
// com o montar-comp.jsx do kit, salva o .aep e uma prévia, fecha o After e devolve tudo ao site. Só trabalha com o After FECHADO (não mexe no projeto de ninguém).
//
// Configuração em plataforma/.env.local:
//   IA_COMP_SERVIDOR=https://darkkitchen.art.br   (sem ele, usa APP_URL)
//   IA_COMP_TOKEN_MAQUINA=<o mesmo token do .env.local do servidor>
//   IA_COMP_AFTERFX=C:\...\AfterFX.exe              (opcional: acha sozinho em Program Files)
// Uso: node scripts/maquina-operaria.mjs   (ou o iniciar-maquina-operaria.bat na raiz)
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const envArq = path.join(raiz, ".env.local");
const env = {
  ...(fs.existsSync(envArq)
    ? Object.fromEntries(
        fs
          .readFileSync(envArq, "utf8")
          .split(/\r?\n/)
          .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
          .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
      )
    : {}),
  ...process.env,
};
const SERVIDOR = (env.IA_COMP_SERVIDOR || env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const TOKEN = env.IA_COMP_TOKEN_MAQUINA;
const TRABALHO = path.join(os.tmpdir(), "dk-maquina-operaria");
const ESPERA = 20_000, LIMITE_AE = 10 * 60_000;

function acharAfterFx() {
  if (env.IA_COMP_AFTERFX && fs.existsSync(env.IA_COMP_AFTERFX)) return env.IA_COMP_AFTERFX;
  const base = "C:/Program Files/Adobe";
  if (!fs.existsSync(base)) return null;
  const versoes = fs.readdirSync(base).filter((d) => /^Adobe After Effects/.test(d)).sort().reverse();
  for (const v of versoes) {
    const exe = path.join(base, v, "Support Files", "AfterFX.exe");
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}
const AFTERFX = acharAfterFx();

const hora = () => new Date().toLocaleTimeString("pt-BR");
const log = (m) => console.log(`[${hora()}] ${m}`);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const auth = { Authorization: `Bearer ${TOKEN}` };

function afterAberto() {
  try {
    return /AfterFX\.exe/i.test(execFileSync("tasklist", ["/FI", "IMAGENAME eq AfterFX.exe"], { encoding: "utf8" }));
  } catch {
    return false;
  }
}

async function enviar(id, tipo, arquivo) {
  const r = await fetch(`${SERVIDOR}/api/v1/ia-comp/${id}/resultado?tipo=${tipo}`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/octet-stream" },
    body: fs.readFileSync(arquivo),
  });
  if (!r.ok) throw new Error(`envio do ${tipo} recusado (${r.status}): ${await r.text()}`);
}

async function avisarFalha(id, erro) {
  await fetch(`${SERVIDOR}/api/v1/ia-comp/${id}/falha`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ erro: String(erro).slice(0, 400) }),
  }).catch(() => {});
}

async function processar(job) {
  const dir = path.join(TRABALHO, `job-${job.id}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  log(`${job.codigo}: baixando o kit...`);
  const r = await fetch(`${SERVIDOR}${job.kit}`, { headers: auth });
  if (!r.ok) throw new Error(`não consegui baixar o kit (${r.status})`);
  const zip = path.join(dir, "kit.zip");
  fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
  execFileSync(path.join(process.env.SystemRoot || "C:/Windows", "System32", "tar.exe"), ["-xf", zip, "-C", dir]); // o tar do Windows (bsdtar) abre .zip

  const barra = (p) => p.replace(/\\/g, "/");
  const aep = path.join(dir, `${job.codigo}.aep`), previa = path.join(dir, "previa.png");
  const fim = path.join(dir, "fim.txt"), erro = path.join(dir, "erro.txt");
  const rodar = path.join(dir, "rodar.jsx");
  fs.writeFileSync(
    rodar,
    "\ufeff" +
      [
        `var DK_SAIDA_AEP = "${barra(aep)}"; var DK_SAIDA_PREVIA = "${barra(previa)}"; var DK_FIM = "${barra(fim)}";`,
        `try { $.evalFile(new File("${barra(path.join(dir, "montar-comp.jsx"))}")); }`,
        `catch (e) { var f = new File("${barra(erro)}"); f.encoding = "UTF-8"; f.open("w"); f.writeln(e.toString() + " (linha " + e.line + ")"); f.close(); }`,
        `try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (e2) {}`,
        `app.quit();`,
      ].join("\n"),
  );

  log(`${job.codigo}: abrindo o After e montando...`);
  const ae = spawn(AFTERFX, ["-r", rodar], { detached: true, stdio: "ignore" });
  ae.unref();
  const inicio = Date.now();
  while (!fs.existsSync(fim) && !fs.existsSync(erro) && Date.now() - inicio < LIMITE_AE) await espera(2000);
  // Dá tempo do After fechar sozinho; senão, encerra.
  for (let i = 0; i < 30 && afterAberto(); i++) await espera(2000);
  if (afterAberto()) {
    try { execFileSync("taskkill", ["/IM", "AfterFX.exe", "/T", "/F"]); } catch {}
  }

  if (fs.existsSync(erro)) throw new Error(fs.readFileSync(erro, "utf8").trim());
  if (!fs.existsSync(fim) || !fs.existsSync(aep)) throw new Error("o After não terminou a montagem em 10 minutos");
  if (fs.existsSync(previa)) await enviar(job.id, "previa", previa);
  await enviar(job.id, "aep", aep);
  log(`${job.codigo}: pronto, .aep enviado ao site.`);
  fs.rmSync(dir, { recursive: true, force: true });
}

async function main() {
  if (!TOKEN) return console.error("Falta IA_COMP_TOKEN_MAQUINA no plataforma/.env.local.");
  if (!AFTERFX) return console.error("After Effects não encontrado. Defina IA_COMP_AFTERFX no plataforma/.env.local.");
  log(`Máquina operária ligada. Site: ${SERVIDOR} · After: ${AFTERFX}`);
  let avisouAberto = false;
  for (;;) {
    try {
      if (afterAberto()) {
        if (!avisouAberto) log("After Effects aberto: aguardando ele ser fechado para trabalhar.");
        avisouAberto = true;
        await espera(ESPERA);
        continue;
      }
      avisouAberto = false;
      const r = await fetch(`${SERVIDOR}/api/v1/ia-comp/proximo`, { headers: auth });
      if (r.status === 401) {
        console.error("Token recusado pelo site. Confira IA_COMP_TOKEN_MAQUINA.");
        await espera(60_000);
        continue;
      }
      if (r.status === 200) {
        const { dados } = await r.json();
        try {
          await processar(dados);
        } catch (e) {
          log(`${dados.codigo}: falhou: ${e.message}`);
          await avisarFalha(dados.id, e.message);
        }
        continue;
      }
    } catch (e) {
      log(`Sem contato com o site (${e.message}). Tento de novo em instantes.`);
    }
    await espera(ESPERA);
  }
}

main();
