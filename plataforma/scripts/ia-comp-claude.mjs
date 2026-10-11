// Dark Kitchen Studio · Fila de criações pedidas ao Claude no chat (IA Comp sem API).
// Usado pelo Claude Code (com o chat aberto, à mão ou com /loop) para ver a fila, marcar que
// começou e baixar o kit (registro.json, interpretação, assets) de um pedido. A entrega é feita
// com scripts/ia-comp-enviar.mjs, que tira o pedido da fila e avisa quem pediu.
// Usa o token da máquina (plataforma/.env.local: IA_COMP_TOKEN_MAQUINA e IA_COMP_SERVIDOR ou APP_URL).
// Uso:
//   node scripts/ia-comp-claude.mjs fila
//   node scripts/ia-comp-claude.mjs pegar --job 3 --dir C:\caminho\da\pasta   (marca "criando" e extrai o kit)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
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
const auth = { Authorization: `Bearer ${env.IA_COMP_TOKEN_MAQUINA}` };
const TAR = path.join(process.env.SystemRoot || "C:/Windows", "System32", "tar.exe");

const [comando, ...resto] = process.argv.slice(2);
const args = {};
for (let i = 0; i < resto.length; i += 2) args[resto[i].replace(/^--/, "")] = resto[i + 1];

async function chamar(url, init = {}) {
  const r = await fetch(`${SERVIDOR}${url}`, { ...init, headers: { ...auth, ...init.headers } });
  if (!r.ok) throw new Error(`${url}: ${r.status} ${await r.text()}`);
  return r;
}

if (comando === "fila") {
  const { dados } = await (await chamar("/api/v1/ia-comp/fila-claude")).json();
  console.log(JSON.stringify(dados, null, 2));
  if (!dados.length) console.log("Fila vazia.");
} else if (comando === "pegar") {
  const job = Number(args.job);
  if (!job || !args.dir) throw new Error("Uso: pegar --job <id> --dir <pasta>");
  const { dados } = await (await chamar("/api/v1/ia-comp/fila-claude")).json();
  const item = dados.find((d) => d.id === job);
  if (!item) throw new Error(`O job ${job} não está na fila do Claude.`);
  if (!item.kitPronto) throw new Error("O kit deste pedido ainda está sendo gerado. Tente de novo em 1 minuto.");
  await chamar(`/api/v1/ia-comp/${job}/claude-comecou`, { method: "POST" });
  fs.rmSync(args.dir, { recursive: true, force: true });
  fs.mkdirSync(args.dir, { recursive: true });
  const zip = path.join(args.dir, "kit.zip");
  fs.writeFileSync(zip, Buffer.from(await (await chamar(item.kit)).arrayBuffer()));
  execFileSync(TAR, ["-xf", zip, "-C", args.dir]);
  fs.writeFileSync(path.join(args.dir, "instrucoes.txt"), item.claude_instrucoes ?? "", "utf8");
  console.log(`${item.codigo} (job ${job}) marcado como "criando"; kit extraído em ${args.dir}.`);
  console.log(`Instruções do admin: ${item.claude_instrucoes || "(nenhuma)"}`);
} else {
  console.error("Uso: node scripts/ia-comp-claude.mjs fila | pegar --job <id> --dir <pasta>");
  process.exit(1);
}
