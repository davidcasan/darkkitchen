// Pix "copia e cola" (BR Code estático, padrão EMV do Banco Central). O QR Code é
// só este texto desenhado. Sem banco nem API: qualquer app de banco lê e paga para a
// chave informada, no valor informado. A confirmação do pagamento é manual (admin).

export interface ConfigPix {
  chave: string;
  nome: string; // recebedor, até 25 caracteres
  cidade: string; // até 15 caracteres
}

/** Tira acentos e caracteres que alguns apps de banco não aceitam. */
const limpar = (s: string, max: number) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,\-/]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, max);

const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido no fim do código. */
function crc16(texto: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Normaliza a chave: CPF/CNPJ só números, telefone com +55, e-mail em minúsculas, aleatória como está. */
export function normalizarChave(chave: string) {
  const c = chave.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return c.toLowerCase();
  if (c.includes("@")) return c.toLowerCase();
  const digitos = c.replace(/\D/g, "");
  if (c.startsWith("+")) return `+${digitos}`;
  if (/^\(?\d{2}\)?\s?9?\d{4}-?\d{4}$/.test(c) && !/^\d{11}$/.test(c)) return `+55${digitos}`;
  return digitos;
}

/** Confere o formato da chave. Devolve o erro, ou null se estiver ok. */
export function erroNaChave(chave: string) {
  if (!chave.trim()) return "Informe a chave Pix.";
  const c = normalizarChave(chave);
  if (!c) return "Chave não reconhecida. Use CPF, CNPJ, e-mail, telefone ou a chave aleatória.";
  if (/^[0-9a-f-]{36}$/.test(c)) return null; // aleatória
  if (c.includes("@")) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c) && c.length <= 77 ? null : "E-mail inválido.";
  if (c.startsWith("+")) return /^\+55\d{10,11}$/.test(c) ? null : "Telefone inválido: use DDD + número.";
  if (/^\d{11}$/.test(c) || /^\d{14}$/.test(c)) return null; // CPF ou CNPJ
  return "Chave não reconhecida. Use CPF, CNPJ, e-mail, telefone ou a chave aleatória.";
}

/**
 * Monta o código Pix copia e cola.
 * txid: identificador da cobrança (até 25 letras e números), aparece no extrato do recebedor.
 */
export function codigoPix(cfg: ConfigPix, valorReais: number, txid: string) {
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", normalizarChave(cfg.chave));
  const id = txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const semCrc =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    campo("54", valorReais.toFixed(2)) +
    campo("58", "BR") +
    campo("59", limpar(cfg.nome, 25) || "RECEBEDOR") +
    campo("60", limpar(cfg.cidade, 15) || "BRASIL") +
    campo("62", campo("05", id)) +
    "6304";
  return semCrc + crc16(semCrc);
}
