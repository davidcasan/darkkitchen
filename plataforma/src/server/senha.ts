import crypto from "node:crypto";

// Hash de senha com scrypt (nativo do Node). Formato salvo: "salt:hash" em hex.

export function hashSenha(senha: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verificarSenha(senha: string, salvo: string): boolean {
  const [saltHex, hashHex] = salvo.split(":");
  if (!saltHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const calculado = crypto.scryptSync(senha, Buffer.from(saltHex, "hex"), esperado.length);
  return crypto.timingSafeEqual(esperado, calculado);
}
