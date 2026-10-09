// Dark Kitchen Studio - backup do banco e dos arquivos dos clientes.
// Roda todo dia pela tarefa "Dark Kitchen - Backup" (instalar-servico.ps1), antes de cada
// atualização (atualizar.ps1) ou à mão: npm run backup
//
// Destino: BACKUP_DESTINO no .env.local (ex.: C:\Users\fulano\OneDrive\Backup Dark Kitchen).
//   banco\dark-kitchen_AAAA-MM-DD_HHMMSS.db  cópia consistente do banco (VACUUM INTO, funciona
//                                           com o servidor ligado); guarda BACKUP_DIAS dias (30)
//   arquivos\...                            arquivos enviados (logos, vídeos, imagens do chat);
//                                           só copia o que é novo e nunca apaga nada no destino
//   backup.log                              uma linha por execução
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const raiz = path.resolve(import.meta.dirname, "..");

// Lê o .env.local (formato CHAVE=valor) sem depender do Next.
function lerEnv() {
  const arq = path.join(raiz, ".env.local");
  if (!fs.existsSync(arq)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(arq, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

const env = { ...lerEnv(), ...process.env };
const destino = env.BACKUP_DESTINO;
const dias = Number(env.BACKUP_DIAS) || 30;
const dados = env.DK_DADOS ? path.resolve(env.DK_DADOS) : path.join(raiz, "data");
const banco = path.join(dados, "dark-kitchen.db");

function registrar(msg) {
  const linha = `${new Date().toISOString()} ${msg}`;
  console.log(linha);
  if (destino) {
    try {
      fs.mkdirSync(destino, { recursive: true });
      fs.appendFileSync(path.join(destino, "backup.log"), linha + "\n");
    } catch {}
  }
}

/** Copia só arquivos novos ou com tamanho diferente. Devolve [copiados, bytes]. */
function copiarNovos(origem, alvo) {
  let copiados = 0;
  let bytes = 0;
  if (!fs.existsSync(origem)) return [0, 0];
  for (const item of fs.readdirSync(origem, { withFileTypes: true })) {
    const de = path.join(origem, item.name);
    const para = path.join(alvo, item.name);
    if (item.isDirectory()) {
      const [c, b] = copiarNovos(de, para);
      copiados += c;
      bytes += b;
    } else if (item.isFile()) {
      const tam = fs.statSync(de).size;
      if (fs.existsSync(para) && fs.statSync(para).size === tam) continue;
      fs.mkdirSync(alvo, { recursive: true });
      fs.copyFileSync(de, para);
      copiados++;
      bytes += tam;
    }
  }
  return [copiados, bytes];
}

try {
  if (!destino) throw new Error("Defina BACKUP_DESTINO no .env.local (pasta onde guardar os backups).");
  if (!fs.existsSync(banco)) throw new Error(`Banco não encontrado: ${banco}`);

  // 1. Banco: cópia consistente com o servidor ligado.
  const pastaBanco = path.join(destino, "banco");
  fs.mkdirSync(pastaBanco, { recursive: true });
  const agora = new Date();
  const carimbo = agora.toISOString().slice(0, 19).replace("T", "_").replaceAll(":", "");
  // Nome único mesmo rodando duas vezes no mesmo segundo (ex.: backup diário + atualização).
  let copia = path.join(pastaBanco, `dark-kitchen_${carimbo}.db`);
  for (let n = 2; fs.existsSync(copia); n++) copia = path.join(pastaBanco, `dark-kitchen_${carimbo}_${n}.db`);
  const db = new DatabaseSync(banco, { readOnly: true });
  db.exec(`VACUUM INTO '${copia.replace(/'/g, "''")}'`);
  db.close();
  const verificacao = new DatabaseSync(copia, { readOnly: true });
  const integro = verificacao.prepare("PRAGMA integrity_check").get().integrity_check === "ok";
  verificacao.close();
  if (!integro) throw new Error(`A cópia do banco não passou na verificação: ${copia}`);

  // 2. Cópias antigas do banco: guarda as dos últimos N dias.
  const limite = agora.getTime() - dias * 86400000;
  let removidas = 0;
  for (const nome of fs.readdirSync(pastaBanco)) {
    const arq = path.join(pastaBanco, nome);
    if (/^dark-kitchen_.*\.db$/.test(nome) && fs.statSync(arq).mtimeMs < limite) {
      fs.rmSync(arq);
      removidas++;
    }
  }

  // 3. Arquivos dos clientes: só o que é novo.
  const [copiados, bytes] = copiarNovos(path.join(dados, "arquivos"), path.join(destino, "arquivos"));

  registrar(
    `OK banco ${(fs.statSync(copia).size / 1048576).toFixed(1)} MB (${path.basename(copia)}), ` +
      `${copiados} arquivo(s) novo(s) (${(bytes / 1048576).toFixed(1)} MB), ${removidas} cópia(s) antiga(s) apagada(s)`,
  );
} catch (e) {
  registrar(`ERRO ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
}
