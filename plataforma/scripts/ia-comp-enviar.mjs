// Dark Kitchen Studio · Envia ao site uma versão da IA Comp feita fora dele (pelo Claude no
// chat, sem gastar a API). A versão atual do pedido fica guardada em "Versões anteriores".
// Usa o mesmo token da máquina operária (plataforma/.env.local: IA_COMP_TOKEN_MAQUINA e
// IA_COMP_SERVIDOR ou APP_URL).
// Uso: node scripts/ia-comp-enviar.mjs --job 3 --zip composicao.zip --previa previa.png --nota "texto"
//      [--espec especificacao.md]   (especificação de produção do After, em markdown)
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

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
const job = Number(args.job);
if (!job || !args.zip || !fs.existsSync(args.zip)) {
  console.error('Uso: node scripts/ia-comp-enviar.mjs --job <id> --zip <composicao.zip> [--previa <previa.png>] [--nota "texto"] [--espec especificacao.md]');
  process.exit(1);
}

async function chamar(url, init) {
  const r = await fetch(`${SERVIDOR}${url}`, { ...init, headers: { ...auth, ...init.headers } });
  if (!r.ok) throw new Error(`${url}: ${r.status} ${await r.text()}`);
}

await chamar(`/api/v1/ia-comp/${job}/nova-versao`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ nota: args.nota ?? "", especificacao: args.espec ? fs.readFileSync(args.espec, "utf8") : "" }),
});
const enviar = (tipo, arq) =>
  chamar(`/api/v1/ia-comp/${job}/resultado?tipo=${tipo}`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: fs.readFileSync(arq),
  });
if (args.previa && fs.existsSync(args.previa)) await enviar("previa", args.previa);
await enviar("aep", args.zip);
console.log(`Versão enviada ao job ${job} em ${SERVIDOR}.`);
